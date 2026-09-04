import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { extractText } from "npm:unpdf@0.12.1";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const strip = (s: string) => s
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/\s+/g, " ").trim();

function jsonLdRecipe(html: string) {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const root of candidates) {
        const nodes = root?.["@graph"] || [root];
        for (const node of nodes) {
          const t = node?.["@type"];
          if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
        }
      }
    } catch {}
  }
  return null;
}

async function docxText(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const f = zip.file("word/document.xml");
  if (!f) throw Error("DOCX document.xml not found");
  return strip(await f.async("text"));
}

function normaliseIngredients(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((x: any) => typeof x === "string" ? x : [x?.amount, x?.unit, x?.name].filter(Boolean).join(" ")).filter(Boolean);
}

function recipeFromJsonLd(r: any) {
  return {
    name: r?.name || null,
    description: r?.description || null,
    ingredients: normaliseIngredients(r?.recipeIngredient),
    method: Array.isArray(r?.recipeInstructions)
      ? r.recipeInstructions.map((x: any) => typeof x === "string" ? x : (x?.text || x?.name || "")).filter(Boolean).join("\n")
      : String(r?.recipeInstructions || ""),
    cuisine: Array.isArray(r?.recipeCuisine) ? r.recipeCuisine.join(", ") : r?.recipeCuisine || null,
    course: Array.isArray(r?.recipeCategory) ? r.recipeCategory.join(", ") : r?.recipeCategory || null,
    servings: r?.recipeYield ? String(r.recipeYield) : null,
    preparation_time_minutes: null,
    cooking_time_minutes: null,
    source_title: r?.headline || r?.name || null
  };
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const id = body?.import_item_id;
  if (!id) return json({ error: "import_item_id is required" }, 400);
  const { data: item, error: itemError } = await sb.from("cc_import_items").select("*").eq("id", id).single();
  if (itemError || !item) return json({ error: "Import item not found" }, 404);
  if (item.created_by !== user.id) return json({ error: "Forbidden" }, 403);

  await sb.from("cc_import_items").update({ extraction_status: "processing", error_message: null }).eq("id", item.id);
  try {
    let text = "";
    let parsed: any = null;
    let sourceTitle = item.source_title || null;
    if (item.source_url) {
      const u = new URL(item.source_url);
      if (!["http:", "https:"].includes(u.protocol)) throw Error("Unsupported source URL");
      const res = await fetch(u.toString(), { headers: { "User-Agent": "Mozilla/5.0 CookingConfidential Recipe Importer" } });
      if (!res.ok) throw Error(`Source returned HTTP ${res.status}`);
      const html = await res.text();
      parsed = jsonLdRecipe(html);
      if (parsed) { text = JSON.stringify(recipeFromJsonLd(parsed)); sourceTitle = parsed?.name || parsed?.headline || sourceTitle; }
      else text = strip(html).slice(0, 120000);
    } else if (item.file_path) {
      const { data: blob, error: e } = await sb.storage.from("cooking-confidential").download(item.file_path);
      if (e || !blob) throw Error("Could not read uploaded file");
      const name = item.file_name || "";
      const mime = item.mime_type || "";
      if (/\.docx$/i.test(name)) text = await docxText(blob);
      else if (mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(name)) text = await blob.text();
      else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
        const out = await extractText(new Uint8Array(await blob.arrayBuffer()));
        text = Array.isArray(out.text) ? out.text.join("\n") : String(out.text || "");
      } else throw Error("This file type needs OCR processing before recipe extraction.");
    } else throw Error("Import item has no source URL or file");
    if (!text.trim()) throw Error("No readable recipe content found");

    const structured = parsed ? recipeFromJsonLd(parsed) : null;
    const { error: updateError } = await sb.from("cc_import_items").update({
      extracted_text: text, source_title: sourceTitle, extraction_status: "ready", review_status: "pending",
      inferred_cuisine: structured?.cuisine || null, inferred_course: structured?.course || null, error_message: null
    }).eq("id", item.id);
    if (updateError) throw updateError;
    return json({ ok: true, status: "ready", import_item_id: item.id, structured: structured || null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("cc_import_items").update({ extraction_status: "failed", error_message: msg }).eq("id", item.id);
    return json({ ok: false, status: "failed", import_item_id: item.id, error: msg }, 500);
  }
});
