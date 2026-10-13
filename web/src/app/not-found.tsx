import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty" style={{ marginTop: 24 }}>
      <p>공고를 찾을 수 없습니다. 삭제되었거나 주소가 잘못되었을 수 있습니다.</p>
      <p><Link href="/">공고 목록으로 돌아가기</Link></p>
    </div>
  );
}
