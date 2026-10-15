"use client";

import { useState } from "react";
import { Boxes, Code2, FileCode2, Folder, GitBranch, MousePointer2, Network, Package, Users } from "lucide-react";

const FILES = [
    { name: "page.tsx", folder: "app", kind: "Entry point", description: "The page that brings the interface together.", code: 'import { Map } from "@/components/Map";\nimport { getRepository } from "@/lib/github";\n\nexport default async function Page() {\n  const repo = await getRepository();\n  return <Map repository={repo} />;\n}' },
    { name: "Map.tsx", folder: "components", kind: "Component", description: "Turns repository data into an interactive map.", code: 'import { buildGraph } from "@/lib/graph";\n\nexport function Map({ repository }) {\n  const graph = buildGraph(repository);\n  return <GraphCanvas data={graph} />;\n}' },
    { name: "github.ts", folder: "lib", kind: "Data layer", description: "Connects the interface to repository data.", code: 'export async function getRepository() {\n  const response = await fetch(repoUrl);\n  if (!response.ok) {\n    throw new Error("Repository unavailable");\n  }\n  return response.json();\n}' },
];

export default function RepositoryPreview() {
    const [selected, setSelected] = useState(0);
    const file = FILES[selected];
    return <div className="atlas-preview">
        <div className="atlas-preview-top"><div className="preview-window-dots" aria-hidden="true"><i /><i /><i /></div><span><GitBranch size={13} /> example / repository</span><span className="preview-demo-label">DEMO</span></div>
        <div className="atlas-preview-body">
            <aside className="preview-sidebar" aria-label="Demo files"><p>WORKSPACE</p><span className="preview-active"><Network size={15} /> File map</span><span><Boxes size={15} /> Architecture</span><span><Users size={15} /> Contributors</span><span><GitBranch size={15} /> Branches</span><span><Package size={15} /> Dependencies</span><p className="preview-files-label">EXPLORE A FILE</p>{FILES.map((item, index) => <button key={item.name} aria-pressed={selected === index} onClick={() => setSelected(index)} className={selected === index ? "selected" : ""}><FileCode2 size={14} />{item.name}</button>)}</aside>
            <div className="preview-map"><div className="preview-map-heading"><span><span className="status-dot" /> Repository map</span><span>3 modules</span></div><svg className="preview-connections" viewBox="0 0 600 360" preserveAspectRatio="none" aria-hidden="true"><path d="M300 70 C300 160 110 120 110 205 M300 70 V205 M300 70 C300 160 490 120 490 205 M110 245 C110 315 300 290 300 245 M300 245 C300 315 490 290 490 245" /></svg><div className="preview-root"><GitBranch size={20} /><div>repository<span>main branch</span></div></div><div className="preview-nodes">{FILES.map((item, index) => <button key={item.name} className={`preview-node ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)} aria-pressed={selected === index}><span><Folder size={15} /> {item.folder}</span><strong><FileCode2 size={14} />{item.name}</strong></button>)}</div><div className="preview-map-hint"><MousePointer2 size={13} /> Select a file to see what&apos;s inside</div></div>
            <aside className="preview-inspector" aria-live="polite"><div className="preview-inspector-title"><Code2 size={15} /> FILE INSPECTOR</div><span className="preview-file-kind">{file.kind}</span><h3>{file.name}</h3><p>{file.description}</p><pre><code>{file.code}</code></pre><div className="preview-inspector-footer"><span className="status-dot" /> Illustrative code preview</div></aside>
        </div>
    </div>;
}
