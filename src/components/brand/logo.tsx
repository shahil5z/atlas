import Image from "next/image";

export function AtlasLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/atlas-logo.jpg"
      alt="Atlas"
      width={720}
      height={720}
      priority={priority}
      className={className}
    />
  );
}

export function AtlasSymbol({ className }: { className?: string }) {
  return (
    <Image
      src="/atlas-mark.jpg"
      alt=""
      width={640}
      height={451}
      className={className}
    />
  );
}
