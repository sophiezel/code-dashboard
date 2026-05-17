import { getMessages } from "@/lib/db";
import { MessagesListClient } from "./MessagesListClient";

export const dynamic = "force-dynamic";
export const revalidate = 15;

export default function MessagesListPage() {
  const messages = getMessages(undefined, 50);

  return <MessagesListClient messages={messages} />;
}
