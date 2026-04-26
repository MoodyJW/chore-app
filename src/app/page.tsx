import { redirect } from "next/navigation";

// The root page just redirects — middleware will send to /login or /dashboard
export default function Home() {
  redirect("/dashboard");
}
