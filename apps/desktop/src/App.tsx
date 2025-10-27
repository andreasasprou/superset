import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import TerminalComponent from "@/components/Terminal";
import "./App.css";

function App() {
	const [activeTabId, setActiveTabId] = useState("1");

	return (
		<div className="w-screen h-screen overflow-hidden flex dark">
			<Sidebar onTabSelect={setActiveTabId} activeTabId={activeTabId} />
			<div className="flex-1">
				<TerminalComponent />
			</div>
		</div>
	);
}

export default App;
