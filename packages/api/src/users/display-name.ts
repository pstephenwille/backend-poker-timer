export interface DisplayNameSource {
  username: string | null;
  googleName: string | null;
  email: string;
}

function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? email;
}

/**
 * Fallbacks are shown exactly as stored: a Google name such as "Mike Jones" or an
 * email prefix such as "mike_j" is never held to the username rules.
 */
export function resolveDisplayName({
  username,
  googleName,
  email,
}: DisplayNameSource): string {
  if (username) {
    return username;
  }
  if (googleName?.trim()) {
    return googleName;
  }
  return emailLocalPart(email);
}
