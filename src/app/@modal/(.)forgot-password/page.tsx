import { AuthModal } from "@/components/account/authModal";
import { AuthPanel } from "@/components/account/authPanel";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Intercepts /forgot-password on in-app navigation. */
export default async function ForgotModal({ searchParams }: Props) {
  return (
    <AuthModal>
      <AuthPanel view="forgot" searchParams={await searchParams} headingTag="h2" />
    </AuthModal>
  );
}
