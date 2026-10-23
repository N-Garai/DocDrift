import type { Metadata } from "next";
import { SignInScreen } from "@/components/signin/SignInScreen";

export const metadata: Metadata = {
  title: "Sign in — DocDrift",
  description:
    "Sign in with your GitHub account — private repositories included — and let the DocDrift agent crew draft your documentation PR.",
};

export default function SignInPage() {
  return <SignInScreen />;
}
