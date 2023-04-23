import ReactDOM from "react-dom/client";
import { AttractorSystemGLSL } from "./attractor_system_glsl";
import "../main.css";

var root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(<AttractorSystemGLSL />);
