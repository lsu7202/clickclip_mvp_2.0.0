// 스톡 캐릭터 아키타입: 실존/고유 인물이 아닌 일반 등장인물의 표준 세트.
// 스타일별로 1회 생성 후 resources/my_characters/<style>/<key>.png 에 캐싱 → 전 영상 재사용(채널 고정 출연진).
// desc: 생성용 고정 외형 묘사(영어, 화풍은 스타일 템플릿이 담당하므로 미포함).
export const ARCHETYPES = [
  // 기본 인물 8
  { key: "할아버지", desc: "An elderly Korean man in his 70s, thin build, kind wrinkled face, white beard and white hair tied up, wearing simple traditional Korean clothing (hanbok) in plain colors" },
  { key: "할머니", desc: "An elderly Korean woman in her 70s, small build, warm wrinkled face, gray hair in a low bun, wearing simple traditional Korean clothing (hanbok) in muted colors" },
  { key: "아저씨", desc: "A sturdy middle-aged Korean man in his 40s, weathered friendly face, short black hair, wearing plain working-class traditional Korean clothing with rolled sleeves" },
  { key: "아줌마", desc: "A middle-aged Korean woman in her 40s, round warm face, black hair in a neat bun, wearing an apron over simple traditional Korean clothing" },
  { key: "청년", desc: "A young Korean man in his early 20s, lean and energetic, bright determined eyes, black topknot hair, wearing simple traditional Korean clothing" },
  { key: "아가씨", desc: "A young Korean woman in her early 20s, graceful posture, long black braided hair with a ribbon, wearing a modest traditional Korean dress (hanbok)" },
  { key: "소년", desc: "A Korean boy around 8 years old, small and lively, short black hair, rosy cheeks, wearing simple child-size traditional Korean clothing" },
  { key: "소녀", desc: "A Korean girl around 7 years old, small and bright-eyed, black hair in two braids, wearing a child-size traditional Korean dress" },
  // 직업형 12
  { key: "왕", desc: "A Korean king in his 50s, dignified stout build, black beard, wearing a red royal dragon robe and the traditional black royal cap" },
  { key: "왕비", desc: "A Korean queen in her 40s, elegant and composed, ornate braided black hair with golden hairpins, wearing a ceremonial red and gold royal dress" },
  { key: "장군", desc: "A Korean general in his 40s, tall imposing build, stern face with a thick black beard, wearing traditional armor with a long red battle cloak and a sword at the waist" },
  { key: "병사", desc: "A young Korean soldier in his 20s, average build, alert expression, wearing simple leather-and-cloth armor with a spear and a round helmet" },
  { key: "선비", desc: "A Korean scholar in his 30s, slim upright posture, calm thoughtful face with a thin mustache, wearing a white scholar robe and a black horsehair hat (gat)" },
  { key: "농부", desc: "A Korean farmer in his 50s, tanned and sturdy, straw hat on his head, wearing rough hemp clothing with trousers rolled to the knees, holding a hoe" },
  { key: "어부", desc: "A Korean fisherman in his 40s, weathered tanned skin, short beard, wearing rough hemp clothing with a rope belt, carrying a fishing net over one shoulder" },
  { key: "나무꾼", desc: "A Korean woodcutter in his 30s, broad-shouldered and honest-faced, wearing patched hemp clothing, carrying an A-frame wooden carrier with firewood on his back" },
  { key: "사냥꾼", desc: "A Korean hunter in his 30s, lean and sharp-eyed, fur-trimmed clothing with leather straps, carrying a bow and a quiver of arrows" },
  { key: "상인", desc: "A Korean merchant in his 40s, plump and shrewd-looking with a friendly smile, wearing layered traditional clothing with a coin pouch at the belt" },
  { key: "스님", desc: "A Korean Buddhist monk in his 50s, shaved head, serene face, wearing a gray monk robe with a brown kasaya sash, holding wooden prayer beads" },
  { key: "의원", desc: "A Korean traditional doctor in his 50s, thin and scholarly, gray goatee, wearing a plain dark robe, carrying a wooden medicine chest" },
  // 동물 4
  { key: "호랑이", desc: "A large powerful Korean tiger with bold black stripes on orange fur, white chest, sharp golden eyes" },
  { key: "토끼", desc: "A small clever white rabbit with long upright ears, round black eyes, fluffy short tail" },
  { key: "여우", desc: "A sly slender fox with orange fur, white-tipped bushy tail, narrow amber eyes" },
  { key: "개", desc: "A loyal medium-sized Korean Jindo dog with cream-white fur, curled tail, alert brown eyes" },
];

export const ARCHETYPE_KEYS = ARCHETYPES.map((a) => a.key);
export const archetypeDesc = (key) => ARCHETYPES.find((a) => a.key === key)?.desc || null;
