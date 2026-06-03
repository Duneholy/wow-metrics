import React, { useState, useEffect } from "react";

export function Clock() {
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      setTimeStr(new Date().toLocaleString("ru-RU", { 
        hour: "2-digit", minute: "2-digit", second: "2-digit", 
        day: "2-digit", month: "2-digit", year: "numeric" 
      }));
    };

    updateTime();
    const timer = window.setInterval(updateTime, 200);

    const onVisibilityChange = () => {
      if (!document.hidden) updateTime();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return <strong>{timeStr}</strong>;
}
