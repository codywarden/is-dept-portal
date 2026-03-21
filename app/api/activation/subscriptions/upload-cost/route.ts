import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";
import pdfParse from "pdf-parse";
import { parseCostPdfPages, detectCostPdfStyle } from "../../../../lib/subscriptions/parseCostPdf";

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
    const bytesForUpload = new Uint8Array(fileBuffer.slice(0));

    const parsed = await parsePdf(Buffer.from(fileBuffer));

    const detectedStyle = style === "auto" ? detectCostPdfStyle(parsed.text) : style;
    const { items } = parseCostPdfPages(parsed.pages, detectedStyle);

    const supabaseAdmin = createSupabaseAdmin();

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
          return NextResponse.json({ error: existingError.message }, { status: 400 });
        }

        (existing ?? []).forEach((row) => {
          if (row.order_number) duplicates.add(row.order_number);
        });
      }

      if (duplicates.size > 0) {
        return NextResponse.json(
          {
            error: "This PDF appears to have already been uploaded (duplicate Order # found).",
            duplicates: Array.from(duplicates),
          },
          { status: 409 },
        );
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
      return {
        ...item,
        location: canonicalizeLocation(item.location, locationNameMap),
        matched_customer_id: matchId,
      };
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
        return NextResponse.json({ error: insertRes.error.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      fileId,
      uploadNumber: fileInsert.data.upload_number ?? null,
      itemCount: itemsWithMatch.length,
      reconcliedCount: itemsWithMatch.filter((i) => i.matched_customer_id).length,
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
