"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("ms_token");
    const room = localStorage.getItem("ms_room");
    if (token) {
      router.replace(room ? `/room/${room}` : "/lobby");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return null;
}
