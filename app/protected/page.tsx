import { requireUser } from "../lib/auth/requireRole";

export default async function ProtectedPage() {
  const { user } = await requireUser();

  return (
    <main style={{ padding: 24 }}>
      <h1>Protected Page</h1>
      <p>Welcome{user.email ? `, ${user.email}` : ""}!</p>
    </main>
  );
}
