import ReactDOM from "react-dom/client";
import { AttractorSystem } from "./attractor_system";
import { AttributesLines } from "./attributes_lines";
import "./main.css";

var root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(<AttractorSystem />);
