/**
 * LukeDelivery B2B — Middleware de autenticación de rutas de Admin
 * Valida el header x-admin-secret contra la variable de entorno ADMIN_SECRET.
 * Uso: if (!validateAdminSecret(req)) return res.status(401).json({ ... });
 */

/**
 * Valida que el request incluya el header correcto con el secreto de admin.
 * @param {import('next').NextApiRequest} req
 * @returns {boolean} true si el secreto es válido, false si no
 */
export function validateAdminSecret(req) {
  const secret = process.env.ADMIN_SECRET;

  // Si no está configurada la variable, rechazar siempre (fail-secure)
  if (!secret || secret.trim() === "") {
    console.error("[admin-auth] ADMIN_SECRET no está definido en las variables de entorno.");
    return false;
  }

  const provided = req.headers["x-admin-secret"];
  return provided === secret;
}

/**
 * Helper para retornar respuesta 401 estándar.
 * @param {import('next').NextApiResponse} res
 */
export function sendUnauthorized(res) {
  return res.status(401).json({
    success: false,
    message: "No autorizado. Se requiere clave de administrador válida.",
  });
}
