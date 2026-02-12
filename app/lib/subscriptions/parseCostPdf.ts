type ParsedCostItem = {
  style: "new" | "old";
  retail_customer: string | null;
  legal_name: string | null;
  org_name: string | null;
  customer_name: string | null;
  location: string | null;
  ordered_by: string | null;
  amount: number | null;
  currency: string | null;
  invoice_number: string | null;
  order_number: string | null;
  description: string | null;
  serial_number: string | null;
  contract_start: string | null;
  contract_end: string | null;
  due_date: string | null;
  raw_text: string;
};

type ParseResult = {
  style: "new" | "old";
  items: ParsedCostItem[];
};

const moneyRegex = /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/;

export function detectCostPdfStyle(text: string): "new" | "old" {
  if (text.includes("DEBIT/CREDIT MEMO")) return "old";
  if (text.includes("Device Serial Number")) return "new";
  return "new";
}

export function parseCostPdfPages(
  pages: { text: string }[],
  style?: "new" | "old",
): ParseResult {
  const joined = pages.map((p) => p.text).join("\n");
  const resolvedStyle = style ?? detectCostPdfStyle(joined);

  if (resolvedStyle === "old") {
    return { style: "old", items: parseOldStylePages(pages) };
  }

  return { style: "new", items: parseNewStyle(pages) };
}

function parseNewStyle(pages: { text: string }[]): ParsedCostItem[] {
  return pages.map((page) => {
    const lines = page.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const retailIdx = lines.findIndex((l) => l.toLowerCase() === "retail");
    const retailCustomer = retailIdx > 0 ? pickRetailCustomer(lines, retailIdx) : null;

    const docInfoIdx = lines.findIndex((l) => l === "Document Information");
    const invoiceNumber = docInfoIdx >= 0 ? lines[docInfoIdx + 1] ?? null : null;

    const currency = lines.find((l) => /^[A-Z]{3}$/.test(l)) ?? "USD";

    const startLine = lines.find((l) => l.startsWith("Contract Start Date:"));
    const endLine = lines.find((l) => l.startsWith("Contract End Date:"));
    const dueLine = lines.find((l) => l.startsWith("Due Date:"));

    const contractStart = startLine ? extractDateFromLine(startLine) : null;
    const contractEnd = endLine ? extractDateFromLine(endLine) : null;
    const dueDate = dueLine ? extractDateFromLine(dueLine) : null;

    const itemsIdx = lines.findIndex((l) => l.startsWith("Items Material Info"));
    const description = itemsIdx >= 0 ? extractItemDescription(lines, itemsIdx) : null;

    const licenseLine = lines.find((l) => l.startsWith("License Number:"));
    const licenseNumber = licenseLine ? licenseLine.replace("License Number:", "").trim() : null;
    const serialLine = lines.find((l) => l.startsWith("Machine Serial Number:"));
    const serialNumber = extractSerialNumber(lines, serialLine);
    const orderNumber = licenseNumber;

    const orderedByIdx = lines.findIndex((l) => l === "Ordered By:");
    const orderedBy = orderedByIdx >= 0 ? pickOrderedBy(lines, orderedByIdx) : null;

    const shipToIdx = lines.findIndex((l) => l === "Ship To:");
    const shipToCity = shipToIdx >= 0 ? extractCityFromAddress(lines, shipToIdx) : null;

    let amount: number | null = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const m = lines[i].match(moneyRegex);
      if (m) {
        amount = Number(m[0].replace(/,/g, ""));
        break;
      }
    }

    return {
      style: "new",
      retail_customer: retailCustomer ?? null,
      legal_name: null,
      org_name: null,
      customer_name: retailCustomer ?? null,
      location: shipToCity,
      ordered_by: orderedBy,
      amount,
      currency,
      invoice_number: invoiceNumber,
      order_number: orderNumber,
      description: licenseLine ? `${description ?? ""}`.trim() : description,
      serial_number: serialNumber,
      contract_start: contractStart,
      contract_end: contractEnd,
      due_date: dueDate,
      raw_text: page.text,
    };
  });
}

function parseOldStylePages(pages: { text: string }[]): ParsedCostItem[] {
  const items: ParsedCostItem[] = [];

  pages.forEach((page) => {
    const lines = page.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const legalIndices = lines.reduce<number[]>((acc, line, idx) => {
      if (line.startsWith("LEGAL NAME:")) acc.push(idx);
      return acc;
    }, []);

    const chargeToIdx = lines.findIndex((l) => l.startsWith("CHARGE/CREDIT TO:"));
    const chargeToCity = chargeToIdx >= 0 ? extractCityFromAddress(lines, chargeToIdx) : null;

    for (let i = 0; i < legalIndices.length; i += 1) {
      const start = legalIndices[i];
      const end = legalIndices[i + 1] ?? lines.length;
      const blockLines = lines.slice(start, end);
      const blockText = blockLines.join("\n");

      const legalName = getLineValue(blockLines, "LEGAL NAME:");
      const orgName = getLineValue(blockLines, "ORGANIZATION:");
      const localPriceLine = blockLines.find((l) => l.startsWith("LOCAL PRICE:"));
      const amountMatch = localPriceLine?.match(moneyRegex);
      const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, "")) : null;

      const orderNumber = getLineValue(blockLines, "ORDER NUMBER:");
      const startDate = getLineValue(blockLines, "START DATE:");
      const endDate = getLineValue(blockLines, "END DATE:");

      const orderIdx = blockLines.findIndex((l) => l.startsWith("ORDER NUMBER:"));
      const description = orderIdx >= 0 ? blockLines[orderIdx + 1] ?? null : null;

      const serialFromAmountLine = blockLines
        .map((l) => l.trim())
        .find((l) => /\b\d{1,3}(?:,\d{3})*\.\d{2}\b/.test(l));
      const serialCandidate = serialFromAmountLine
        ? extractSerialFromAmountLine(serialFromAmountLine)
        : null;

      const customerName = orgName && orgName.toLowerCase() !== "n/a" ? orgName : legalName;

      items.push({
        style: "old",
        retail_customer: null,
        legal_name: legalName,
        org_name: orgName,
        customer_name: customerName ?? null,
        location: chargeToCity,
        ordered_by: null,
        amount,
        currency: "USD",
        invoice_number: null,
        order_number: orderNumber,
        description,
        serial_number: serialCandidate ?? null,
        contract_start: startDate ? parseDate(startDate) : null,
        contract_end: endDate ? parseDate(endDate) : null,
        due_date: null,
        raw_text: blockText,
      });
    }
  });

  return items;
}

function extractCityFromAddress(lines: string[], headerIdx: number) {
  const segment = lines.slice(headerIdx, headerIdx + 10);
  const cityStateLine = segment.find((l) => /,\s*[A-Z]{2}\b/.test(l));
  if (cityStateLine) {
    const city = cityStateLine.split(",")[0]?.trim();
    if (city) return city;
  }

  const cityStateZip = segment.find((l) => /\b[A-Z]{2}\b\s\d{5}(?:-\d{4})?$/i.test(l));
  if (cityStateZip) {
    const city = cityStateZip.replace(/\s+[A-Z]{2}\b.*$/, "").trim();
    return city || null;
  }

  return null;
}

function getLineValue(lines: string[], label: string) {
  const line = lines.find((l) => l.startsWith(label));
  if (!line) return null;
  return line.replace(label, "").trim() || null;
}

function parseDate(value: string): string | null {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function extractDateFromLine(line: string) {
  const m = line.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return parseDate(m[0]);
}

function extractItemDescription(lines: string[], itemsIdx: number) {
  const after = lines.slice(itemsIdx + 1, itemsIdx + 6);
  const itemLine = after.find((l) => /^\d{5,}\s+/.test(l)) ?? after[0];
  if (!itemLine) return null;
  const first = itemLine.replace(/^\d{5,}\s+/, "").trim();
  const next = after.find(
    (l) =>
      l !== itemLine &&
      !l.startsWith("License Number:") &&
      !l.startsWith("Machine Serial Number:") &&
      !l.startsWith("Contract Start Date:") &&
      !l.startsWith("Contract End Date:") &&
      !moneyRegex.test(l),
  );
  if (next && !next.startsWith("Items Material Info")) {
    return `${first} ${next}`.trim();
  }
  return first || null;
}

function extractSerialNumber(lines: string[], serialLine?: string) {
  if (serialLine) {
    const inline = serialLine.replace("Machine Serial Number:", "").trim();
    if (inline) return inline;
    const idx = lines.indexOf(serialLine);
    if (idx >= 0) {
      const next = lines
        .slice(idx + 1)
        .find(
          (l) =>
            l &&
            !l.includes(":") &&
            !moneyRegex.test(l) &&
            !/total amount with tax|shipment/i.test(l),
        );
      if (next && isSerialValue(next)) return next;
    }
  }

  return null;
}

function isSerialValue(value: string) {
  if (/shipment/i.test(value)) return false;
  return /^[A-Z0-9]{13}$|^[A-Z0-9]{17}$/i.test(value.replace(/\s+/g, ""));
}

function extractSerialFromAmountLine(line: string) {
  const match = line.match(/([A-Z0-9]{13}|[A-Z0-9]{17})\s+\d{1,3}(?:,\d{3})*\.\d{2}/i);
  if (match) return match[1];

  const tokens = line.split(/\s+/).filter(Boolean);
  const candidate = tokens.find((t) => isSerialValue(t));
  return candidate ?? null;
}

function pickRetailCustomer(lines: string[], retailIdx: number) {
  for (let i = retailIdx - 1; i >= Math.max(0, retailIdx - 5); i -= 1) {
    const candidate = lines[i];
    if (!candidate) continue;
    if (isAddressLine(candidate)) continue;
    return candidate;
  }
  return lines[retailIdx - 1] ?? null;
}

function pickOrderedBy(lines: string[], orderedByIdx: number) {
  const after = lines[orderedByIdx + 1];
  if (after && isOrderedByValue(after)) return after;

  for (let i = orderedByIdx - 1; i >= Math.max(0, orderedByIdx - 8); i -= 1) {
    const candidate = lines[i];
    if (!candidate) continue;
    if (!isOrderedByValue(candidate)) continue;
    return candidate;
  }
  return lines[orderedByIdx - 1] ?? null;
}

function isOrderedByValue(value: string) {
  if (/^[A-Z]{3}$/.test(value)) return false; // currency
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return false; // date
  if (/^\d+$/.test(value)) return false; // invoice number
  if (/^O-/.test(value)) return false; // sales order
  if (/total amount with tax/i.test(value)) return false;
  return /[A-Z].*\d/.test(value);
}

function isAddressLine(value: string) {
  const v = value.toLowerCase();
  if (v.includes("po box")) return true;
  if (/^\d/.test(value)) return true;
  if (/\b(st|street|ave|avenue|rd|road|blvd|drive|dr|hwy|highway|ln|lane)\b/i.test(value)) return true;
  return false;
}

export type { ParsedCostItem, ParseResult };
