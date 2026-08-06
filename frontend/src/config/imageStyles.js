// 이미지 스타일 템플릿: 장면 이미지·캐릭터 레퍼런스 생성 프롬프트에 공통 접미로 붙어
// 영상 전체의 분위기/화풍을 통일한다. (기존 "2D 일러스트"도 하나의 템플릿)
export const IMAGE_STYLES = [
  { key: "illust", name: "🎨 일러스트 (기본)", prompt: "Draw a Styled 2D illustration Image." },
  { key: "minhwa", name: "🖌 전래동화 (한국 민화)", prompt: "Korean traditional folk painting (minhwa) style, hanji paper texture, soft ink outlines with light color wash, folk art brushwork." },
  { key: "sageuk", name: "🏯 사극 (시네마틱)", prompt: "Cinematic Korean historical drama style, realistic digital painting, period-accurate costumes and architecture, dramatic natural lighting." },
  { key: "lego", name: "🧱 레고", prompt: "LEGO brick world style: characters as LEGO minifigures, objects and buildings built from LEGO bricks, glossy plastic texture, visible studs, bright toy colors." },
  { key: "anim3d", name: "🎬 3D 애니메이션", prompt: "3D animated feature film style, expressive stylized characters, soft global illumination, high-detail render." },
  { key: "webtoon", name: "📱 웹툰", prompt: "Korean webtoon style, clean bold lineart, flat cel shading, vivid colors, dynamic composition." },
  { key: "watercolor", name: "💧 수채화 동화책", prompt: "Soft watercolor storybook illustration, gentle color bleeding, visible paper texture, warm cozy mood." },
  { key: "pixel", name: "👾 픽셀 아트", prompt: "16-bit pixel art style, limited retro color palette, crisp pixels, side-scroller game scene look." },
  { key: "clay", name: "🧸 클레이 (스톱모션)", prompt: "Claymation stop-motion style, handmade clay texture with fingerprints, miniature diorama look, soft studio lighting." },
  { key: "noir", name: "🌑 다큐 느와르", prompt: "Dark documentary noir illustration, muted desaturated palette, heavy shadows, dramatic rim lighting, serious mood." },
];

export const styleP = (key) =>
  (IMAGE_STYLES.find((s) => s.key === key) || IMAGE_STYLES[0]).prompt;

// 이미지 모델이 글자를 못 그림 → 모든 이미지 생성 프롬프트 끝에 강제 부착
export const NO_TEXT = "Absolutely no text, no letters, no numbers, no words, no writing, no signs with writing anywhere in the image.";
