import { useEffect, useState } from "react";

const dayOf = (now: number) => {
  const at = new Date(now);
  return `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}`;
};

/**
 * Today's date, as a string that changes at local midnight.
 *
 * Dates render relative to today ("오늘", "내일", overdue in a warmer ink),
 * and rows are memoised, so without something that changes at midnight a
 * window left open overnight — normal for the desktop app — keeps yesterday's
 * words. Checked on a timer aimed at the next midnight and whenever the page
 * becomes visible again (a sleeping laptop does not run timers on time).
 */
export function useDay(): string {
  const [day, setDay] = useState(() => dayOf(Date.now()));
  useEffect(() => {
    const check = () => setDay(dayOf(Date.now()));
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = setTimeout(check, next + 1000);
    const wake = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [day]);
  return day;
}
