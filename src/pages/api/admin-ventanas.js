import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("ventanas_pedido")
        .select("*")
        .order("fecha_cierre", { ascending: false });

      if (error) throw error;
      return res.status(200).json({ success: true, ventanas: data || [] });
    } catch (err) {
      console.error("[Admin Ventanas API] Error GET:", err);
      return res.status(500).json({ success: false, message: "Error al listar ventanas." });
    }
  }

  if (req.method === "POST") {
    const { nombre, fecha_cierre, fecha_entrega, activa } = req.body;

    if (!nombre || !fecha_cierre || !fecha_entrega) {
      return res.status(400).json({ success: false, message: "Datos incompletos." });
    }

    try {
      const { data, error } = await supabase
        .from("ventanas_pedido")
        .insert({
          nombre,
          fecha_cierre,
          fecha_entrega,
          activa: activa !== undefined ? activa : true,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, ventana: data });
    } catch (err) {
      console.error("[Admin Ventanas API] Error POST:", err);
      return res.status(500).json({ success: false, message: "Error al crear la ventana." });
    }
  }

  if (req.method === "PUT") {
    const { id, nombre, fecha_cierre, fecha_entrega, activa } = req.body;

    if (!id || !nombre || !fecha_cierre || !fecha_entrega) {
      return res.status(400).json({ success: false, message: "Datos incompletos o ID faltante." });
    }

    try {
      const { data, error } = await supabase
        .from("ventanas_pedido")
        .update({
          nombre,
          fecha_cierre,
          fecha_entrega,
          activa: activa !== undefined ? activa : true,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, ventana: data });
    } catch (err) {
      console.error("[Admin Ventanas API] Error PUT:", err);
      return res.status(500).json({ success: false, message: "Error al actualizar la ventana." });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, message: "ID requerido." });
    }

    try {
      // Ojo: si hay pedidos que hacen referencia a esta ventana, al eliminarla puede lanzar error de FK
      // Para evitar esto, podemos nullificar o manejar la eliminación. En general es mejor desactivar o lanzar error amigable.
      const { error } = await supabase
        .from("ventanas_pedido")
        .delete()
        .eq("id", id);

      if (error) {
        if (error.code === "23503") {
          return res.status(400).json({
            success: false,
            message: "No se puede eliminar la ventana porque ya tiene pedidos asociados. Te recomendamos desactivarla en su lugar.",
          });
        }
        throw error;
      }
      return res.status(200).json({ success: true, message: "Ventana eliminada con éxito." });
    } catch (err) {
      console.error("[Admin Ventanas API] Error DELETE:", err);
      return res.status(500).json({ success: false, message: "Error al eliminar la ventana." });
    }
  }

  res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
  return res.status(405).json({ success: false, message: `Método ${req.method} no permitido` });
}
