import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import { PDFParse } from "pdf-parse";
import path from "path";
import { pathToFileURL } from "url";
import { parseSoldPdfText } from "../../../../lib/subscriptions/parseSoldPdf";

const STANDARD_FONT_URL = "https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/";
const workerPath = path.resolve(
  process.cwd(),
  "node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
);
PDFParse.setWorker(pathToFileURL(workerPath).toString());

type CustomerRow = { id: string; name: string | null };

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }


    const allowedTypes = new Set([
      "application/pdf",
      "text/csv",
      "application/csv",
      "application/vnd.ms-excel",
    ]);

    if (!allowedTypes.has(file.type)) {
      return NextResponse.json({ error: "Only PDF or CSV files are supported" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const bytesForUpload = new Uint8Array(fileBuffer.slice(0));

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "CSV uploads will be supported soon. Please upload a PDF for now." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

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

    const parser = new PDFParse({
      data: new Uint8Array(fileBuffer.slice(0)),
      standardFontDataUrl: STANDARD_FONT_URL,
      useWorkerFetch: false,
    });
    const parsed = await parser.getText();
    const { items } = parseSoldPdfText(parsed.text, {
      locationCodeMap: Object.keys(locationCodeMap).length > 0 ? locationCodeMap : undefined,
      knownLocations: knownLocations.length > 0 ? knownLocations : undefined,
    });

    const { data: customers, error: customersError } = await supabaseAdmin
      .from("sa_customers")
      .select("id, name");

    if (customersError) {
      return NextResponse.json({ error: customersError.message }, { status: 400 });
    }

    const customerList = (customers ?? []) as CustomerRow[];
    const normalizedMap = new Map<string, string>();
    customerList.forEach((c) => {
      if (!c.name) return;
      normalizedMap.set(normalizeName(c.name), c.id);
    });

    const itemsWithMatch = items.map((item) => {
      const nameForMatch = item.customer_name ?? "";
      const matchId = matchCustomerId(nameForMatch, normalizedMap, customerList);
      return {
        ...item,
        location: canonicalizeLocation(item.location, locationNameMap),
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
          return NextResponse.json({ error: existingError.message }, { status: 400 });
        }

        (existing ?? []).forEach((row) => {
          if (row.invoice_number) duplicates.add(row.invoice_number);
        });
      }

      if (duplicates.size > 0) {
        return NextResponse.json(
          {
            error: "This PDF appears to have already been uploaded (duplicate Invoice # found).",
            duplicates: Array.from(duplicates),
          },
          { status: 409 },
        );
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
      return NextResponse.json({ error: uploadRes.error.message }, { status: 400 });
    }

    const insert = await supabaseAdmin
      .from("sa_subscription_sold_files")
      .insert([
        {
          uploaded_by: authData.user.id,
          original_filename: file.name,
          storage_path: storagePath,
          item_count: itemsWithMatch.length,
          matched_count: itemsWithMatch.filter((i) => i.matched_customer_id).length,
        },
      ])
      .select()
      .single();

    if (insert.error) {
      return NextResponse.json({ error: insert.error.message }, { status: 400 });
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
        return NextResponse.json({ error: itemInsert.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      fileId,
      uploadNumber: insert.data.upload_number ?? null,
      itemCount: itemsWithMatch.length,
      reconcliedCount: itemsWithMatch.filter((i) => i.matched_customer_id).length,
      items: insertRows.map((i) => ({
        invoice_number: i.invoice_number,
        customer_name: i.customer_name,
        retail_price: i.retail_price,
        description: i.description,
        serial_number: i.serial_number,
        sold_by: i.sold_by,
        invoice_date: i.invoice_date,
        location: i.location,
        matched_customer_id: i.matched_customer_id,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
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

function matchCustomerId(
  name: string,
  normalizedMap: Map<string, string>,
  customers: CustomerRow[],
) {
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
