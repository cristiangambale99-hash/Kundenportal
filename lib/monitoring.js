async function logFehlversuch(supabase, { kategorie, grund, ip }) {
  try {
    await supabase.from("fehlversuche").insert({ kategorie: kategorie || null, grund, ip });
  } catch {
    // Monitoring darf nie die eigentliche Anfrage zum Absturz bringen.
  }
}

module.exports = { logFehlversuch };
