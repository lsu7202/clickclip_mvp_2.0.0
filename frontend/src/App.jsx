import { useStore } from "./store/useStore.js";
import SetupScreen from "./components/SetupScreen.jsx";
import EditorScreen from "./components/EditorScreen.jsx";

export default function App() {
  const step = useStore((s) => s.step);
  return step === "setup" ? <SetupScreen /> : <EditorScreen />;
}
