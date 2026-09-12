import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./TitleBar.module.css";

/** Header: course title with the instructors underneath. */
export function TitleBar({
  align = "center",
}: {
  /** "left" is the desktop placement, "center" the landscape one. */
  align?: "center" | "left";
}) {
  const title = usePlayerState((s) => s.video?.title ?? null);
  const instructor = usePlayerState((s) => s.video?.instructor ?? null);

  if (!title) return null;

  return (
    <div className={`${styles.bar} ${align === "left" ? styles.left : ""}`}>
      <h2 className={styles.title}>{title}</h2>
      {instructor ? <p className={styles.instructor}>{instructor}</p> : null}
    </div>
  );
}
