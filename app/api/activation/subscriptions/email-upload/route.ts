import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import pdfParse from "pdf-parse";
import { parseCostPdfPages, detectCostPdfStyle } from "../../../../lib/subscriptions/parseCostPdf";
import { parseSoldPdfText } from "../../../../lib/subscriptions/parseSoldPdf";

async function parsePdf(buffer: Buffer): Promise<{ text: string; pages: { text: string }[] }> {
  const pageTexts: { text: string }[] = [];
  const result = await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: { str: string }[] }> }) => {
      const content = await pageData.getTextContent();
      const text = content.items.map((item) => item.str).join("\n");
      pageTexts.push({ text });
      return text;
    },
  });
  return { text: result.text, pages: pageTexts };
}

type UploadType = "cost" | "sold";
type CostStyle = "auto" | "new" | "old";
type CustomerRow = { id: string; name: string | null };

type UploadResult = {
  fileName: string;
  type: UploadType;
  ok: boolean;
  fileId?: string;
  uploadNumber?: number | null;
  itemCount?: number;
  error?: string;
};

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role environment variables");
  }

  return createClient(url, key);
}

function getEmailUploadUserId() {
  const userId = process.env.ACTIVATION_EMAIL_UPLOAD_USER_ID?.trim();
  if (!userId) {
    throw new Error("Missing ACTIVATION_EMAIL_UPLOAD_USER_ID");
  }
  return userId;
}

function validateSecret(req: NextRequest, form: FormData) {
  const expected = process.env.ACTIVATION_EMAIL_UPLOAD_SECRET?.trim();
  if (!expected) {
    throw new Error("Missing ACTIVATION_EMAIL_UPLOAD_SECRET");
  }

  const headerSecret = req.headers.get("x-activation-email-secret")?.trim();
  const bodySecret = String(form.get("secret") ?? "").trim();
  const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";
  const provided = headerSecret || bodySecret || querySecret;

  return provided.length > 0 && provided === expected;
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeLocationKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalizeLocation(value: string | null | undefined, locationNameMap: Map<string, string>) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const canonical = locationNameMap.get(normalizeLocationKey(raw));
  return canonical ?? null;
}

function matchCustomerId(name: string, normalizedMap: Map<string, string>, customers: CustomerRow[]) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const direct = normalizedMap.get(normalized);
  if (direct) return direct;

  const partial = customers.find((c) => {
    if (!c.name) return false;
    const candidate = normalizeName(c.name);
    return candidate.includes(normalized) || normalized.includes(candidate);
  });

  return partial?.id ?? null;
}

function inferUploadType(fileName: string, subject: string, fallback: UploadType | null): UploadType | null {
  if (fallback) return fallback;

  const haystack = `${fileName} ${subject}`.toLowerCase();

  if (haystack.includes("cost")) return "cost";
  if (haystack.includes("retail") || haystack.includes("sold")) return "sold";

  return null;
}

async function processCostFile(params: {
  file: File;
  style: CostStyle;
  uploadedBy: string;
  supabaseAdmin: SupabaseClient;
}) {
  const { file, style, uploadedBy, supabaseAdmin } = params;

  if (file.type !== "application/pdf") {
    throw new Error("Cost uploads must be PDF files");
  }

  const fileBuffer = await file.arrayBuffer();
  const bytesForUpload = new Uint8Array(fileBuffer.slice(0));

  const parsed = await parsePdf(Buffer.from(fileBuffer));

  const detectedStyle = style === "auto" ? detectCostPdfStyle(parsed.text) : style;
  const { items } = parseCostPdfPages(parsed.pages, detectedStyle);

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("name");

  const locationNameMap = new Map<string, string>();
  (locations ?? []).forEach((row) => {
    const canonical = row.name?.trim();
    if (!canonical) return;
    locationNameMap.set(normalizeLocationKey(canonical), canonical);
  });

  const orderNumbers = Array.from(
    new Set(
      items
        .map((item) => item.order_number?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (orderNumbers.length > 0) {
    const duplicates = new Set<string>();
    const chunkSize = 500;

    for (let i = 0; i < orderNumbers.length; i += chunkSize) {
      const chunk = orderNumbers.slice(i, i + chunkSize);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("sa_subscription_cost_items")
        .select("order_number")
        .in("order_number", chunk);

      if (existingError) {
        throw new Error(existingError.message);
      }

      (existing ?? []).forEach((row) => {
        if (row.order_number) duplicates.add(row.order_number);
      });
    }

    if (duplicates.size > 0) {
      throw new Error("This PDF appears to have already been uploaded (duplicate Order # found)");
    }
  }

  const storagePath = `cost/${Date.now()}-${file.name}`;
  const uploadRes = await supabaseAdmin.storage
    .from("subscriptions")
    .upload(storagePath, bytesForUpload, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadRes.error) {
    throw new Error(uploadRes.error.message);
  }

  const { data: customers, error: customersError } = await supabaseAdmin
    .from("sa_customers")
    .select("id, name");

  if (customersError) {
    throw new Error(customersError.message);
  }

  const customerList = (customers ?? []) as CustomerRow[];
  const normalizedMap = new Map<string, string>();

  customerList.forEach((customer) => {
    if (!customer.name) return;
    normalizedMap.set(normalizeName(customer.name), customer.id);
  });

  const itemsWithMatch = items.map((item) => {
    const nameForMatch = item.customer_name || item.retail_customer || item.legal_name || item.org_name || "";
    const matchId = matchCustomerId(nameForMatch, normalizedMap, customerList);

    return {
      ...item,
      location: canonicalizeLocation(item.location, locationNameMap) ?? item.location ?? null,
      matched_customer_id: matchId,
    };
  });

  const fileInsert = await supabaseAdmin
    .from("sa_subscription_cost_files")
    .insert([
      {
        uploaded_by: uploadedBy,
        original_filename: file.name,
        storage_path: storagePath,
        style: detectedStyle,
        item_count: itemsWithMatch.length,
        matched_count: itemsWithMatch.filter((i) => i.matched_customer_id).length,
      },
    ])
    .select()
    .single();

  if (fileInsert.error) {
    throw new Error(fileInsert.error.message);
  }

  const fileId = fileInsert.data.id as string;
  const uploadNumber = fileInsert.data.upload_number;
  const year = new Date().getFullYear();

  const insertRows = itemsWithMatch.map((item, idx) => ({
    file_id: fileId,
    style: item.style,
    retail_customer: item.retail_customer,
    legal_name: item.legal_name,
    org_name: item.org_name,
    customer_name: item.customer_name,
    location: item.location,
    ordered_by: item.ordered_by,
    matched_customer_id: item.matched_customer_id,
    amount: item.amount,
    currency: item.currency,
    invoice_number: item.invoice_number,
    order_number: item.order_number,
    description: item.description,
    serial_number: item.serial_number,
    contract_start: item.contract_start,
    contract_end: item.contract_end,
    due_date: item.due_date,
    item_number: `C-${year}-${uploadNumber ?? 0}-${idx + 1}`,
    raw_text: item.raw_text,
  }));

  if (insertRows.length > 0) {
    const insertRes = await supabaseAdmin.from("sa_subscription_cost_items").insert(insertRows);
    if (insertRes.error) {
      throw new Error(insertRes.error.message);
    }
  }

  return {
    fileId,
    uploadNumber,
    itemCount: itemsWithMatch.length,
  };
}

async function processSoldFile(params: {
  file: File;
  uploadedBy: string;
  supabaseAdmin: SupabaseClient;
}) {
  const { file, uploadedBy, supabaseAdmin } = params;

  const allowedTypes = new Set([
    "application/pdf",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
  ]);

  if (!allowedTypes.has(file.type)) {
    throw new Error("Retail uploads must be PDF or CSV files");
  }

  if (file.type !== "application/pdf") {
    throw new Error("CSV retail uploads are not supported yet. Please email a PDF for now.");
  }

  const fileBuffer = await file.arrayBuffer();
  const bytesForUpload = new Uint8Array(fileBuffer.slice(0));

  const { data: locationCodes } = await supabaseAdmin
    .from("sa_location_codes")
    .select("code, location_name");

  const locationCodeMap = (locationCodes ?? []).reduce<Record<string, string>>((acc, row) => {
    if (row.code && row.location_name) acc[row.code.toUpperCase()] = row.location_name;
    return acc;
  }, {});

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("name");

  const knownLocations = (locations ?? []).map((l) => l.name).filter(Boolean) as string[];
  const locationNameMap = new Map<string, string>();

  knownLocations.forEach((location) => {
    locationNameMap.set(normalizeLocationKey(location), location);
  });

  const parsed = await parsePdf(Buffer.from(fileBuffer));

  const { items } = parseSoldPdfText(parsed.text, {
    locationCodeMap: Object.keys(locationCodeMap).length > 0 ? locationCodeMap : undefined,
    knownLocations: knownLocations.length > 0 ? knownLocations : undefined,
  });

  const { data: customers, error: customersError } = await supabaseAdmin
    .from("sa_customers")
    .select("id, name");

  if (customersError) {
    throw new Error(customersError.message);
  }

  const customerList = (customers ?? []) as CustomerRow[];
  const normalizedMap = new Map<string, string>();

  customerList.forEach((customer) => {
    if (!customer.name) return;
    normalizedMap.set(normalizeName(customer.name), customer.id);
  });

  const itemsWithMatch = items.map((item) => {
    const nameForMatch = item.customer_name ?? "";
    const matchId = matchCustomerId(nameForMatch, normalizedMap, customerList);
    return {
      ...item,
      location: canonicalizeLocation(item.location, locationNameMap) ?? item.location ?? null,
      matched_customer_id: matchId,
    };
  });

  const invoiceNumbers = Array.from(
    new Set(
      itemsWithMatch
        .map((item) => item.invoice_number?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (invoiceNumbers.length > 0) {
    const duplicates = new Set<string>();
    const chunkSize = 500;

    for (let i = 0; i < invoiceNumbers.length; i += chunkSize) {
      const chunk = invoiceNumbers.slice(i, i + chunkSize);
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("sa_subscription_sold_items")
        .select("invoice_number")
        .in("invoice_number", chunk);

      if (existingError) {
        throw new Error(existingError.message);
      }

      (existing ?? []).forEach((row) => {
        if (row.invoice_number) duplicates.add(row.invoice_number);
      });
    }

    if (duplicates.size > 0) {
      throw new Error("This PDF appears to have already been uploaded (duplicate Invoice # found)");
    }
  }

  const storagePath = `sold/${Date.now()}-${file.name}`;
  const uploadRes = await supabaseAdmin.storage
    .from("subscriptions")
    .upload(storagePath, bytesForUpload, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadRes.error) {
    throw new Error(uploadRes.error.message);
  }

  const insert = await supabaseAdmin
    .from("sa_subscription_sold_files")
    .insert([
      {
        uploaded_by: uploadedBy,
        original_filename: file.name,
        storage_path: storagePath,
        item_count: itemsWithMatch.length,
        matched_count: itemsWithMatch.filter((i) => i.matched_customer_id).length,
      },
    ])
    .select()
    .single();

  if (insert.error) {
    throw new Error(insert.error.message);
  }

  const fileId = insert.data.id as string;
  const uploadNumber = insert.data.upload_number;
  const year = new Date().getFullYear();

  const insertRows = itemsWithMatch.map((item, idx) => ({
    file_id: fileId,
    invoice_number: item.invoice_number,
    invoice_date: item.invoice_date,
    customer_name: item.customer_name,
    retail_price: item.retail_price,
    description: item.description,
    serial_number: item.serial_number,
    sold_by: item.sold_by,
    location: item.location,
    item_number: `R-${year}-${uploadNumber ?? 0}-${idx + 1}`,
    matched_customer_id: item.matched_customer_id,
    raw_text: item.raw_text,
  }));

  if (insertRows.length > 0) {
    const itemInsert = await supabaseAdmin
      .from("sa_subscription_sold_items")
      .insert(insertRows);

    if (itemInsert.error) {
      throw new Error(itemInsert.error.message);
    }
  }

  return {
    fileId,
    uploadNumber,
    itemCount: itemsWithMatch.length,
  };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    if (!validateSecret(req, form)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uploadedBy = getEmailUploadUserId();
    const supabaseAdmin = createServiceClient();

    const subject = String(form.get("subject") ?? "").trim();
    const style = (String(form.get("style") ?? "auto").trim().toLowerCase() as CostStyle) || "auto";

    const uploadTypeRaw = String(
      form.get("uploadType") ?? req.nextUrl.searchParams.get("uploadType") ?? "",
    )
      .trim()
      .toLowerCase();
    const uploadTypeOverride: UploadType | null = uploadTypeRaw === "cost" || uploadTypeRaw === "sold"
      ? uploadTypeRaw
      : null;

    const allEntries = Array.from(form.entries());

    const directFiles = allEntries
      .map(([, value]) => value)
      .filter((value): value is File => value instanceof File && value.size > 0);

    const urlStrings = Array.from(form.entries())
      .map(([, value]) => value)
      .filter((value): value is string => {
        if (typeof value !== "string") return false;
        try { new URL(value); return true; } catch { return false; }
      });

    const downloadedFiles = await Promise.all(
      urlStrings.map(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          const disposition = res.headers.get("content-disposition") ?? "";
          const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
          const fileName = match?.[1]?.trim() || url.split("/").pop()?.split("?")[0] || "attachment.pdf";
          const finalName = fileName.includes(".") ? fileName : `${fileName}.pdf`;
          const contentType = (!blob.type || blob.type === "application/octet-stream") ? "application/pdf" : blob.type;
          return new File([blob], decodeURIComponent(finalName), { type: contentType });
        } catch (err) {
          console.error(`[email-upload] fetch error for ${url.slice(0, 60)}:`, err);
          return null;
        }
      }),
    );

    const files = [
      ...directFiles,
      ...downloadedFiles.filter((f): f is File => f !== null && f.size > 0),
    ];

    if (files.length === 0) {
      return NextResponse.json({ error: "No attachments found" }, { status: 400 });
    }

    const results: UploadResult[] = [];

    for (const file of files) {
      const inferredType = inferUploadType(file.name, subject, uploadTypeOverride);
      if (!inferredType) {
        results.push({
          fileName: file.name,
          type: "cost",
          ok: false,
          error: "Could not infer upload type. Include cost/retail/sold in the subject or filename.",
        });
        continue;
      }

      try {
        if (inferredType === "cost") {
          const out = await processCostFile({ file, style, uploadedBy, supabaseAdmin });
          results.push({
            fileName: file.name,
            type: "cost",
            ok: true,
            fileId: out.fileId,
            uploadNumber: out.uploadNumber,
            itemCount: out.itemCount,
          });
        } else {
          const out = await processSoldFile({ file, uploadedBy, supabaseAdmin });
          results.push({
            fileName: file.name,
            type: "sold",
            ok: true,
            fileId: out.fileId,
            uploadNumber: out.uploadNumber,
            itemCount: out.itemCount,
          });
        }
      } catch (err) {
        results.push({
          fileName: file.name,
          type: inferredType,
          ok: false,
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      ok: failureCount === 0,
      successCount,
      failureCount,
      results,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
