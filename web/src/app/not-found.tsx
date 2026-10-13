import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <EmptyState
      kind="notfound"
      title="페이지를 찾을 수 없습니다"
      actions={<Link className="btn btn-primary" href="/">공고 목록으로</Link>}
    >
      <p>공고가 내려갔거나 주소가 잘못되었을 수 있습니다.</p>
    </EmptyState>
  );
}
