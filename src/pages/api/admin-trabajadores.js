import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(req, res) {
  // Autenticación básica usando el secreto de admin
  const authHeader = req.headers.authorization;
  const adminSecret = process.env.NEXT_PUBLIC_ADMIN_SECRET;

  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ success: false, message: "No autorizado" });
  }

  const supabase = createAdminClient();

  if (req.method === "POST") {
    const payload = req.body;
    const { data, error } = await supabase.from("trabajadores").insert([payload]).select();
    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ success: false, message: "Este número de WhatsApp ya se encuentra registrado." });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
    return res.status(200).json({ success: true, data });
  } 
  
  if (req.method === "PUT") {
    const { id, ...payload } = req.body;
    const { data, error } = await supabase.from("trabajadores").update(payload).eq("id", id).select();
    if (error) {
      if (error.code === '23505') { // Unique violation
        return res.status(400).json({ success: false, message: "Este número de WhatsApp ya se encuentra registrado." });
      }
      return res.status(500).json({ success: false, message: error.message });
    }
    return res.status(200).json({ success: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    const { data, error } = await supabase.from("trabajadores").delete().eq("id", id).select();
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.status(200).json({ success: true, data });
  }

  res.setHeader("Allow", ["POST", "PUT", "DELETE"]);
  return res.status(405).end(`Método ${req.method} no permitido`);
}
