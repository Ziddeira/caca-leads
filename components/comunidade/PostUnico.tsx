"use client";

import { useRouter } from "next/navigation";
import type { Post } from "@/lib/comunidade/tipos";
import CartaoPost from "./CartaoPost";

// Um post sozinho, com os comentários já abertos (página do post no
// painel). Apagou? Volta para o feed.
export default function PostUnico({ post }: { post: Post }) {
  const router = useRouter();
  return (
    <CartaoPost
      post={post}
      comentariosAbertos
      onApagado={() => router.push("/painel/comunidade")}
      onRepublicado={() => router.push("/painel/comunidade")}
    />
  );
}
