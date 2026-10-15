import { AuthModal } from "@/components/account/authModal";
import { AuthPanel } from "@/components/account/authPanel";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/* Intercepts /signup on in-app navigation. */
export default async function SignupModal({ searchParams }: Props) {
  return (
    <AuthModal>
      <AuthPanel view="signup" searchParams={await searchParams} headingTag="h2" />
    </AuthModal>
  );
}
