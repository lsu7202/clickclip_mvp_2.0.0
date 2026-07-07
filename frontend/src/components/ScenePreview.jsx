// 좌측: 선택 장면 합성 미리보기(미디어+프레임+자막 위치). §4.2/§8.2
import { resUrl, workspaceUrl } from "../api/client.js";
import { useStore } from "../store/useStore.js";

export default function ScenePreview({ scene }) {
  const templateId = useStore((s) => s.templateId);
  const captions = useStore((s) => s.captions);
  const media = scene?.media;
  const sub1 = scene?.subtitle1Lines?.[0]?.text;
  // 원본 자막: 이 장면의 원본 소스 윈도우[origStart,origEnd]에 겹치는 첫 캡션(소스 앵커)
  const sub2 = media?.origSourceId
    ? captions.find(
        (c) => c.sourceId === media.origSourceId &&
          c.startUs < (media.origEndUs ?? Infinity) && c.endUs > (media.origStartUs ?? 0)
      )?.text
    : undefined;
  const com = scene?.commentaryLines?.[0]?.text; // 해설 자막(첫 줄)

  const flip = scene?.flipH ? { transform: "scaleX(-1)" } : undefined;
  return (
    <div className="preview-frame">
      {media && media.durationUs != null ? (
        <video src={workspaceUrl(media.localPath)} style={flip} muted loop autoPlay playsInline />
      ) : media ? (
        <img src={workspaceUrl(media.localPath)} style={flip} alt="" />
      ) : (
        <div className="empty" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          미디어 없음
        </div>
      )}
      {templateId && (
        <img className="overlay" src={resUrl(`/res/templates/${templateId}`)} alt="" />
      )}
      {sub1 && <div className="preview-sub s1">{sub1}</div>}
      {sub2 && <div className="preview-sub s2">{sub2}</div>}
      {com && <div className="preview-sub s2" style={{ bottom: "26%", color: "#ffd28a" }}>{com}</div>}
    </div>
  );
}
