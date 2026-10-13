import { sampleDataset, USE_SAMPLE } from "@/lib/config";

/** NEXT_PUBLIC_USE_SAMPLE 이 false 가 아니면 화면 맨 위에 표시 */
export function SampleBanner() {
  if (!USE_SAMPLE) return null;
  return (
    <div className="sample-banner" role="status">
      <div className="container">
        <strong>샘플 데이터</strong>
        화면 시험용 가짜 공고입니다. 기관명·공고 내용은 실제와 관계가 없습니다.
        {sampleDataset() === "stress" && " (극단 케이스 검증 데이터)"}
      </div>
    </div>
  );
}
