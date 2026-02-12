import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { PDFParse } from "pdf-parse";
import path from "path";
import { pathToFileURL } from "url";
import { parseCostPdfPages, detectCostPdfStyle } from "../../../../lib/subscriptions/parseCostPdf";

const STANDARD_FONT_URL = "https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/";
const workerPath = path.resolve(
  process.cwd(),
  "node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs",
);
PDFParse.setWorker(pathToFileURL(workerPath).toString());

type CustomerRow = { id: string; name: string | null };

type UploadStyle = "auto" | "new" | "old";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const style = (form.get("style") as UploadStyle | null) ?? "auto";

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const bytesForParse = new Uint8Array(fileBuffer.slice(0));
    const bytesForUpload = new Uint8Array(fileBuffer.slice(0));

    const parser = new PDFParse({
      data: bytesForParse,
      standardFontDataUrl: STANDARD_FONT_URL,
      useWorkerFetch: false,
    });
    const parsed = await parser.getText();

    const detectedStyle = style === "auto" ? detectCostPdfStyle(parsed.text) : style;
    const { items } = parseCostPdfPages(parsed.pages, detectedStyle);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const storagePath = `cost/${Date.now()}-${file.name}`;
    const uploadRes = await supabaseAdmin.storage
      .from("subscriptions")
      .upload(storagePath, bytesForUpload, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadRes.error) {
      return NextResponse.json({ error: uploadRes.error.message }, { status: 400 });
    }

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
      const nameForMatch = item.customer_name || item.retail_customer || item.legal_name || item.org_name || "";
      const matchId = matchCustomerId(nameForMatch, normalizedMap, customerList);
      return { ...item, matched_customer_id: matchId };
    });

    const fileInsert = await supabaseAdmin
      .from("sa_subscription_cost_files")
      .insert([
        {
          uploaded_by: authData.user.id,
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
      return NextResponse.json({ error: fileInsert.error.message }, { status: 400 });
    }

    const fileId = fileInsert.data.id as string;

    const insertRows = itemsWithMatch.map((item) => ({
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
      raw_text: item.raw_text,
    }));

    if (insertRows.length > 0) {
      const insertRes = await supabaseAdmin.from("sa_subscription_cost_items").insert(insertRows);
      if (insertRes.error) {
        return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      fileId,
      itemCount: itemsWithMatch.length,
      matchedCount: itemsWithMatch.filter((i) => i.matched_customer_id).length,
      items: itemsWithMatch.map((i) => ({
        customer_name: i.customer_name,
        retail_customer: i.retail_customer,
        legal_name: i.legal_name,
        org_name: i.org_name,
        amount: i.amount,
        currency: i.currency,
        location: i.location,
        ordered_by: i.ordered_by,
        matched_customer_id: i.matched_customer_id,
      })),
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
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
