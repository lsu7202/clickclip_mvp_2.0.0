// 로딩 표현은 애니메이션만(§4.8). 진행바·퍼센트 금지.
export default function Loading({ text }) {
  return (
    <div className="loading-box">
      <div className="spinner" />
      {text && <span>{text}</span>}
    </div>
  );
}

export function Spinner({ sm }) {
  return <div className={`spinner${sm ? " sm" : ""}`} />;
}
