import { institutionColor, institutionInitial } from "@/lib/avatar";

/** 기관 로고 대신 쓰는 이니셜 아이콘. 장식용이라 스크린리더에서는 숨긴다(기관명은 옆에 글자로 표시) */
export function InstitutionAvatar({ name, size = "md", muted = false }: { name: string; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  return (
    <span
      className={`avatar avatar-${size}${muted ? " avatar-muted" : ""}`}
      style={{ backgroundColor: institutionColor(name) }}
      aria-hidden="true"
    >
      {institutionInitial(name)}
    </span>
  );
}
