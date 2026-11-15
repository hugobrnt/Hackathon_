const names: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  facebook: "Facebook",
  tiktok: "TikTok",
  twitter: "X",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
};
export function PlatformBadge({
  platform,
  label = false,
}: {
  platform: string;
  label?: boolean;
}) {
  const name = names[platform] ?? platform;
  const asset = [
    "instagram",
    "linkedin",
    "youtube",
    "facebook",
    "tiktok",
    "twitter",
    "x",
  ].includes(platform);
  return (
    <span className={"platform-badge platform-" + platform} title={name}>
      {asset ? (
        <img
          src={"/assets/" + (platform === "x" ? "twitter" : platform) + ".svg"}
          alt={label ? "" : name}
        />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1)}</span>
      )}
      {label && <span>{name}</span>}
      {!asset && !label && <span className="sr-only">{name}</span>}
    </span>
  );
}
