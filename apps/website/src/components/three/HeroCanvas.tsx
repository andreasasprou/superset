"use client";

import { Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { Mesh, PointLight } from "three";
import * as THREE from "three";
import { useHeroVisibility } from "../motion/HeroParallax";

// Custom shader for wave animation (GPU-accelerated)
const waveVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;

  void main() {
    vec3 pos = position;

    // Create wave effect using sine waves
    float wave1 = sin(pos.x * 0.5 + uTime * 0.5) * 0.1;
    float wave2 = sin(pos.y * 0.5 + uTime * 0.3) * 0.1;
    pos.z += wave1 + wave2;

    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const waveFragmentShader = `
  uniform vec3 uColor;
  uniform float uRoughness;
  uniform float uMetalness;
  varying vec3 vNormal;

  void main() {
    // Simple lighting calculation
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.0);
    vec3 color = uColor * (0.3 + diff * 0.7);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function LitBackground() {
	const meshRef = useRef<Mesh>(null);
	const lightRef = useRef<PointLight>(null);
	const textGroupRef = useRef<THREE.Group>(null);
	const { viewport, camera } = useThree();
	const isVisible = useHeroVisibility();

	// Create shader material with uniforms
	const shaderMaterial = useMemo(
		() => ({
			uniforms: {
				uTime: { value: 0 },
				uColor: { value: new THREE.Color("#1a1a1a") },
				uRoughness: { value: 0.8 },
				uMetalness: { value: 0.2 },
			},
			vertexShader: waveVertexShader,
			fragmentShader: waveFragmentShader,
		}),
		[],
	);

	useFrame((state) => {
		// Skip expensive operations when hero is not visible
		if (!isVisible) return;

		if (lightRef.current) {
			// Convert normalized mouse coords to viewport coordinates
			const x = (state.mouse.x * viewport.width) / 2;
			const y = (state.mouse.y * viewport.height) / 2;
			// Position light slightly in front of the plane
			lightRef.current.position.set(x, y, 2);

			// Change color based on position - cooler palette (blue to cyan to purple)
			// Map x position to hue range: 180° (cyan) to 270° (blue/purple)
			const hue = 180 + ((state.mouse.x + 1) / 2) * 90; // 180-270 degrees
			// Map y position to saturation
			const saturation = 60 + ((state.mouse.y + 1) / 2) * 40; // 60-100%
			const lightness = 65; // Slightly brighter for cool colors

			lightRef.current.color.setHSL(
				hue / 360,
				saturation / 100,
				lightness / 100,
			);
		}

		// Make the text group face the camera
		if (textGroupRef.current) {
			textGroupRef.current.lookAt(camera.position);
		}

		// Make the plane always face the camera and update shader time
		if (meshRef.current) {
			meshRef.current.lookAt(camera.position);

			// Update shader time uniform (GPU handles the animation)
			const material = meshRef.current.material as THREE.ShaderMaterial;
			if (material.uniforms?.uTime) {
				material.uniforms.uTime.value = state.clock.elapsedTime;
			}
		}
	});

	return (
		<>
			{/* Background plane that fills the viewport and faces camera */}
			<mesh ref={meshRef} position={[0, 0, 0]}>
				<planeGeometry
					args={[viewport.width * 1.5, viewport.height * 1.5, 40, 40]}
				/>
				<shaderMaterial
					attach="material"
					uniforms={shaderMaterial.uniforms}
					vertexShader={shaderMaterial.vertexShader}
					fragmentShader={shaderMaterial.fragmentShader}
				/>
			</mesh>

			{/* 3D Text that reacts to light */}
			<group ref={textGroupRef} position={[0, 0.5, 1]}>
				{/* Outer edge layer - highly metallic */}
				<Text
					position={[0, 0, 0.02]}
					fontSize={1.805}
					color="black"
					anchorX="center"
					anchorY="middle"
					outlineWidth={0.0001}
					outlineColor="#575757"
				>
					⊇
					<meshBasicMaterial color="#000000" />
				</Text>

				{/* Create depth by layering multiple text instances - reduced from 30 to 15 for performance */}
				{[...Array(15)].map((_, i) => (
					<Text
						key={i.toString()}
						position={[0, 0, -i * 0.05]}
						fontSize={1.8}
						color="#0a0a0a"
						anchorX="center"
						anchorY="middle"
					>
						⊇
						<meshStandardMaterial
							color="#2c3539"
							metalness={0.85}
							roughness={0.25}
							emissive="#000000"
							emissiveIntensity={0}
							envMapIntensity={1.5}
						/>
					</Text>
				))}
			</group>

			{/* Ambient light for base visibility */}
			<ambientLight intensity={1} />

			{/* Static directional lights for consistent highlights */}
			<directionalLight
				position={[10, 10, 5]}
				intensity={1.2}
				color="#ffffff"
			/>
			<directionalLight
				position={[-8, -8, 5]}
				intensity={0.6}
				color="#4488ff"
			/>

			{/* Point light that follows mouse */}
			<pointLight
				ref={lightRef}
				intensity={25}
				color="#ffffff"
				distance={50}
				decay={1.2}
			/>
		</>
	);
}

interface HeroCanvasProps {
	className?: string;
}

export function HeroCanvas({ className }: HeroCanvasProps) {
	return (
		<div
			className={className}
			style={{
				pointerEvents: "auto",
				willChange: "transform",
				transform: "translateZ(0)",
			}}
		>
			<Canvas
				camera={{ position: [0, 0, 5], fov: 45 }}
				style={{ background: "#0a0a0a" }}
				dpr={[1, 2]} // Limit pixel ratio for better performance
				performance={{ min: 0.5 }} // Allow frame rate to drop if needed
				frameloop="always" // Ensure consistent frame loop
				gl={{
					antialias: true,
					alpha: false,
					powerPreference: "high-performance",
				}}
			>
				<Suspense fallback={null}>
					<LitBackground />
				</Suspense>
			</Canvas>
		</div>
	);
}
