import { PRIVACY_BODY } from "@/config/app";

export function PrivacyNote() {
  return (
    <p className="max-w-xl text-sm leading-6 text-muted-foreground">{PRIVACY_BODY}</p>
  );
}
