import { AuthModal } from "@/components/account/authModal";
import { AuthPanel } from "@/components/account/authPanel";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Intercepts /login on in-app navigation: the same screen, in a dialog over the current page. */
export default async function LoginModal({ searchParams }: Props) {
  return (
    <AuthModal>
      <AuthPanel view="login" searchParams={await searchParams} headingTag="h2" />
    </AuthModal>
  );
}
