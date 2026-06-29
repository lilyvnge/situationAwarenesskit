import logoUrl from "../assets/logo.gif";

export default function BrandMark({ className = "", size = "default" }) {
  return (
    <img
      className={`brand-mark brand-mark-${size} ${className}`.trim()}
      src={logoUrl}
      alt="Situation Awareness Kit logo"
    />
  );
}
