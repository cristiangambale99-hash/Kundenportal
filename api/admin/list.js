const { getSupabase } = require("../../lib/supabase");
const { requireAdmin } = require("../../lib/adminAuth");

module.exports = async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabase = getSupabase();
  const { kategorie, status } = req.query || {};

  let query = supabase
    .from("meldungen")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (kategorie) query = query.eq("kategorie", kategorie);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ meldungen: data });
};
