type ParsedSoldItem = {
  invoice_number: string | null;
  invoice_date: string | null;
  customer_name: string | null;
  retail_price: number | null;
  description: string | null;
  serial_number: string | null;
  sold_by: string | null;
  location: string | null;
  raw_text: string | null;
};

type ParseSoldResult = {
  items: ParsedSoldItem[];
};

type ParseSoldOptions = {
  locationCodeMap?: Record<string, string>;
  knownLocations?: string[];
};

const MONEY_REGEX = /-?\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;

export function parseSoldPdfText(text: string, options: ParseSoldOptions = {}): ParseSoldResult {
  const locationCodeMap = options.locationCodeMap ?? DEFAULT_LOCATION_CODE_MAP;
  const knownLocations = options.knownLocations ?? Object.values(locationCodeMap);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const invoiceNumberFromBox = findLabelValue(lines, /invoice\s*no\.?/i, isInvoiceNumber);
  const invoiceNumber = invoiceNumberFromBox ?? findFirstMatch(lines, [
    /invoice\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Za-z0-9-]+)/i,
    /invoice\s*no\.?\s*[:#]?\s*([A-Za-z0-9-]+)/i,
    /invoice\s*#\s*([A-Za-z0-9-]+)/i,
  ]);

  const invoiceDateFromBox = findLabelValue(lines, /date/i, isDateLike);
  const invoiceDateRaw = invoiceDateFromBox ?? findFirstMatch(lines, [
    /invoice\s*date\s*[:#]?\s*([A-Za-z0-9\/-]+)/i,
    /date\s*[:#]?\s*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
  ]);
  const invoiceDate = invoiceDateRaw ? normalizeDate(invoiceDateRaw) : null;

  const customerName = findFirstMatch(lines, [
    /sold\s*to\s*[:#]?\s*(.+)/i,
    /customer\s*name\s*[:#]?\s*(.+)/i,
    /customer\s*[:#]?\s*(.+)/i,
  ]);

  const customerFromInvoiceToAccount = findCustomerAfterLabel(lines, /invoice\s*to\s*account\s*no\.?/i);
  const customerFromBillTo = findCustomerFromBlock(lines, "bill to");
  const customerFromSoldTo = findCustomerFromBlock(lines, "sold to");
  const customerFromInvoiceTo = findCustomerFromBlock(lines, "invoice to");
  const customerFromDeliverTo = findCustomerFromBlock(lines, "deliver to");
  const finalCustomer =
    customerFromInvoiceToAccount ??
    customerName ??
    customerFromSoldTo ??
    customerFromInvoiceTo ??
    customerFromBillTo ??
    customerFromDeliverTo;

  const soldByRaw = findLabelText(lines, /salesperson/i);
  const soldBy = soldByRaw ? formatSoldBy(soldByRaw) : null;

  const location = findLocation(lines, locationCodeMap, knownLocations);

  const serialNumber = findFirstMatch(lines, [
    /serial\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Za-z0-9-]+)/i,
    /s\/?n\s*[:#]?\s*([A-Za-z0-9-]+)/i,
  ]);

  const itemsFromLines = extractItems(lines, {
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    customer_name: finalCustomer,
    sold_by: soldBy,
    location,
  }, locationCodeMap);

  if (itemsFromLines.length > 0) {
    return { items: itemsFromLines };
  }

  const { description, serialNumberFromComment } = findCommentDetails(lines);
  const retailPrice = findBestAmount(lines);
  const serial = serialNumber ?? serialNumberFromComment;

  const items: ParsedSoldItem[] = [
    {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      customer_name: finalCustomer,
      sold_by: soldBy,
      retail_price: retailPrice,
      description,
      serial_number: serial,
      location,
      raw_text: text,
    },
  ];

  return { items };
}

function findFirstMatch(lines: string[], regexes: RegExp[]) {
  for (const line of lines) {
    for (const regex of regexes) {
      const match = line.match(regex);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

function findLabelValue(
  lines: string[],
  label: RegExp,
  validate?: (value: string) => boolean,
) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!label.test(line)) continue;

    const inline = line.split(label)[1]?.replace(/[:#]/g, " ").trim();
    const inlineValue = inline ? extractToken(inline, validate) : null;
    if (inlineValue) return inlineValue;

    const scanned = scanForward(lines, i + 1, 5, validate);
    if (scanned) return scanned;
  }
  return null;
}

function findLabelText(lines: string[], label: RegExp) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!label.test(line)) continue;

    const inline = line.split(label)[1]?.replace(/[:#]/g, " ").trim();
    if (inline) return inline;

    const next = findNextNonEmpty(lines, i + 1);
    if (next) return next;
  }
  return null;
}

function scanForward(
  lines: string[],
  start: number,
  maxLines: number,
  validate?: (value: string) => boolean,
) {
  for (let i = start; i < Math.min(lines.length, start + maxLines); i += 1) {
    const value = extractToken(lines[i], validate);
    if (value) return value;
  }
  return null;
}

function extractToken(text: string, validate?: (value: string) => boolean) {
  const tokens = text.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/[^A-Za-z0-9/\-]/g, "");
    if (!cleaned) continue;
    if (!validate || validate(cleaned)) return cleaned;
  }
  return null;
}

function isDateLike(value: string) {
  return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(value);
}

function isInvoiceNumber(value: string) {
  return /^\d{5,}$/.test(value);
}

function findCommentDetails(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/comment/i.test(line)) {
      const inline = line.split(/comment\w*\s*[:#]?/i)[1]?.trim();
      const text = inline || lines[i + 1] || "";
      const serial = extractSerial(text);
      const description = text.trim();
      return {
        serialNumberFromComment: serial,
        description: description || null,
      };
    }
  }

  return { serialNumberFromComment: null, description: null };
}

function extractSerial(value: string) {
  const match = value.match(/\bP[A-Z0-9]{12}\b|\bP[A-Z0-9]{16}\b/gi);
  if (match?.[0]) return match[0];
  return null;
}

function findLocation(
  lines: string[],
  locationCodeMap: Record<string, string>,
  knownLocations: string[],
) {
  for (const line of lines) {
    const btiParen = line.match(/BTI[^()]*\(([^)]+)\)/i);
    if (btiParen?.[1]) return normalizeLocation(btiParen[1].trim(), knownLocations);

    const known = findLocationByName(line, knownLocations);
    if (known) return known;
  }

  for (const line of lines) {
    const code = line.match(/ISACTIVE\d+/i)?.[0]?.toUpperCase();
    if (!code) continue;
    const mapped = locationCodeMap[code] ?? DEFAULT_LOCATION_CODE_MAP[code];
    if (mapped) return mapped;
  }

  return null;
}

function findCustomerFromBlock(lines: string[], label: string) {
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(label)) {
      const next = findNextNonEmpty(lines, i + 1);
      if (next) return next;
    }
  }
  return null;
}

function findCustomerAfterLabel(lines: string[], label: RegExp) {
  for (let i = 0; i < lines.length; i += 1) {
    if (label.test(lines[i])) {
      const next = findNextNonEmpty(lines, i + 1);
      if (next) return next;
    }
  }
  return null;
}

function findNextNonEmpty(lines: string[], start: number) {
  for (let i = start; i < lines.length; i += 1) {
    const value = lines[i]?.trim();
    if (value) return value;
  }
  return null;
}

function findLocationByName(line: string, knownLocations: string[]) {
  for (const loc of knownLocations) {
    const pattern = new RegExp(`\\bBTI\\s+${loc}\\b`, "i");
    if (pattern.test(line)) return loc;
  }
  return null;
}

function normalizeLocation(value: string, knownLocations: string[]) {
  const trimmed = value.trim();
  const match = knownLocations.find(
    (loc) => loc.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  return trimmed;
}

function extractItems(
  lines: string[],
  base: {
    invoice_number: string | null;
    invoice_date: string | null;
    customer_name: string | null;
    sold_by: string | null;
    location: string | null;
  },
  locationCodeMap: Record<string, string>,
) {
  const items: ParsedSoldItem[] = [];
  let lastItems: ParsedSoldItem[] = [];
  let lastWasActivationCode = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isActiveCode = line.match(/ISACTIVE\d+/i)?.[0]?.toUpperCase() ?? null;
    const isDescriptionOnly = !isActiveCode && /IS\s*ACTIVATION/i.test(line);
    const hasActivation = Boolean(isActiveCode) || isDescriptionOnly;

    if (hasActivation) {
      // "IS ACTIVATIONS 5" is the description column of the same row as "ISACTIVE5".
      // Skip it to avoid creating a duplicate item with no location/code.
      if (isDescriptionOnly && lastWasActivationCode) {
        lastWasActivationCode = false;
        continue;
      }

      lastWasActivationCode = Boolean(isActiveCode);

      // Look at this line + next few lines for price, but strip ISACTIVE codes so
      // the trailing digit (e.g. the "5" in ISACTIVE5) isn't picked up as a price.
      const contextLines = [line.replace(/ISACTIVE\d+/gi, "")];
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        if (/IS\s*ACTIVATION/i.test(lines[j]) || /ISACTIVE\d+/i.test(lines[j])) break;
        if (/^comment/i.test(lines[j]) || /merchant|card\s*no|auth\.\s*no/i.test(lines[j])) break;
        contextLines.push(lines[j]);
      }
      const linePrice = findBestAmount(contextLines);
      const quantity = parseQuantity(line);
      const descriptionMatch = line.match(/IS\s*ACTIVATION\s*[^\d]*\d*/i)?.[0]?.trim();
      const lineSerial = extractSerial(line);
      const lineLocation = isActiveCode
        ? (locationCodeMap[isActiveCode] ?? DEFAULT_LOCATION_CODE_MAP[isActiveCode] ?? null)
        : null;

      const repeat = quantity && quantity > 1 ? Math.floor(quantity) : 1;
      const newItems: ParsedSoldItem[] = [];
      for (let r = 0; r < repeat; r += 1) {
        const item: ParsedSoldItem = {
          invoice_number: base.invoice_number,
          invoice_date: base.invoice_date,
          customer_name: base.customer_name,
          sold_by: base.sold_by,
          retail_price: linePrice ?? null,
          description: descriptionMatch ?? null,
          serial_number: lineSerial,
          location: lineLocation ?? base.location,
          raw_text: line,
        };
        items.push(item);
        newItems.push(item);
      }

      lastItems = newItems;
      continue;
    }

    if (/comment/i.test(line) && lastItems.length > 0) {
      const inline = line.split(/comment\w*\s*[:#]?/i)[1]?.trim();
      const text = inline || findNextNonEmpty(lines, i + 1) || "";
      const serial = extractSerial(text);
      const description = text.trim();
      lastItems.forEach((item) => {
        if (description) item.description = description;
        if (serial) item.serial_number = serial;
      });
    }
  }

  return items;
}

function parseQuantity(line: string) {
  const match = line.match(/^\s*(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

const DEFAULT_LOCATION_CODE_MAP: Record<string, string> = {
  ISACTIVE1: "Bucklin",
  ISACTIVE2: "Greensburg",
  ISACTIVE4: "Ness City",
  ISACTIVE5: "Pratt",
  ISACTIVE6: "Hoxie",
  ISACTIVE7: "Great Bend",
};

function findBestAmount(lines: string[]) {
  let totalLike: number | null = null;
  const amounts: number[] = [];

  for (const line of lines) {
    const values = line.match(MONEY_REGEX);
    if (!values || values.length === 0) continue;

    const parsed = values
      .map((value) => parseMoney(value))
      .filter((num): num is number => Number.isFinite(num));

    if (parsed.length === 0) continue;

    amounts.push(...parsed);

    if (/total|amount due|balance due|grand total/i.test(line)) {
      totalLike = parsed[parsed.length - 1];
    }
  }

  if (totalLike !== null) return totalLike;
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  const mdy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const iso = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return trimmed;
}

function formatSoldBy(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase());

  if (parts.length === 0) return "";

  const first = capitalize(parts[0]);
  if (parts.length === 1) return first;

  const secondInitial = capitalize(parts[1]).charAt(0);
  return `${first} ${secondInitial}.`;
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export type { ParsedSoldItem, ParseSoldResult, ParseSoldOptions };