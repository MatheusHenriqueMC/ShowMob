"use client";

interface AvatarProps {
  color: string;
  avatar: string | null;
  name: string;
  size: number;
  className?: string;
}

export function Avatar({ color, avatar, name, size, className = "" }: AvatarProps) {
  const initials = (name || "?").substring(0, 2).toUpperCase();
  const fontSize = Math.round(size / 3);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: "50%",
    border: `2px solid ${color}`,
    background: color + "22",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };

  if (avatar) {
    return (
      <div className={className} style={style}>
        <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        ...style,
        color,
        fontSize,
        fontFamily: "var(--font-orbitron)",
        fontWeight: 700,
      }}
    >
      {initials}
    </div>
  );
}
