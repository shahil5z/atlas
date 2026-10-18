import Link from "next/link";
import { AtlasLogo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <AtlasLogo className="h-auto w-36" />
      <p className="mt-6 text-sm text-muted-foreground">404</p>
      <h1 className="mt-3 font-serif text-4xl tracking-tight">This page is not part of Atlas</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Research stays on the home page. Nothing was uploaded.
      </p>
      <Link href="/" className="mt-8 text-sm text-foreground underline decoration-foreground/40 underline-offset-4">
        Back to Atlas
      </Link>
    </main>
  );
}
