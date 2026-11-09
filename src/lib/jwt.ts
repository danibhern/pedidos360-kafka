// src/lib/jwt.ts
// Decodifica el payload de un JWT SOLO para inspección en el cliente.
// NO valida la firma: la validación real la hace el JWT authorizer del API Gateway.

export interface JwtClaims {
  aud?: string;
  iss?: string;
  scp?: string; // scopes delegados, separados por espacio
  roles?: string[]; // app roles
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

export function scopesOf(claims: JwtClaims | null): string[] {
  if (!claims?.scp) return [];
  return claims.scp.split(' ').filter(Boolean);
}
