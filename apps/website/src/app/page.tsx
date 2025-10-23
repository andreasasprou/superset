import { Card } from "@superset/ui/card";
import { FadeUp } from "@/components/motion/FadeUp";
import { HeroParallax } from "@/components/motion/HeroParallax";
import { TiltCard } from "@/components/motion/TiltCard";
import { HeroCanvas } from "@/components/three/HeroCanvas";

// Feature cards data
const FEATURES = [
    {
        title: "Framer Motion",
        description:
            "Smooth, production-ready animations for hover, scroll-reveal, and route transitions. DOM-based for optimal performance.",
        delay: 0.1,
    },
    {
        title: "React Three Fiber",
        description:
            "Optional lightweight 3D elements for hero sections and product showcases. WebGL-powered visual depth.",
        delay: 0.2,
    },
    {
        title: "Clean Architecture",
        description:
            "Composable, maintainable components. 95% DOM-based interactions with strategic 3D enhancements.",
        delay: 0.3,
    },
] as const;

// Client logos data
const CLIENT_LOGOS = [
    { name: "OpenAI", logo: "OpenAI" },
    { name: "Cash App", logo: "Cash App" },
    { name: "Scale", logo: "scale" },
    { name: "Ramp", logo: "ramp" },
    { name: "Vercel", logo: "Vercel" },
    { name: "Coinbase", logo: "coinbase" },
    { name: "BOOM", logo: "BOOM" },
    { name: "Cursor", logo: "CURSOR" },
] as const;

// Hero section component
function HeroSection() {
    return (
        <HeroParallax className="relative min-h-screen flex items-center justify-center overflow-hidden pointer-events-none">
            <div className="absolute inset-0 z-0">
                <HeroCanvas className="w-full h-full" />
                <div className="absolute inset-0 bg-linear-to-b from-black/0 via-black/30 to-black" />
            </div>

            <div className="relative z-10 px-8 text-center text-white flex flex-col items-center justify-center gap-4 mt-[30rem]">
                <FadeUp>
                    <h1 className="text-[14rem] font-bold leading-none -mt-16">
                        Superset
                    </h1>
                </FadeUp>
                <FadeUp delay={0.2}>
                    <h2 className="text-2xl font-thin">
                        The last app you'll ever need
                    </h2>
                </FadeUp>
            </div>
        </HeroParallax>
    );
}

// Feature card component
interface FeatureCardProps {
    title: string;
    description: string;
    delay: number;
}

function FeatureCard({ title, description, delay }: FeatureCardProps) {
    return (
        <FadeUp delay={delay}>
            <TiltCard>
                <Card className="p-8 h-full hover:shadow-2xl transition-shadow bg-zinc-900 border-zinc-800">
                    <h3 className="text-2xl font-semibold mb-4 text-white">{title}</h3>
                    <p className="text-zinc-400">{description}</p>
                </Card>
            </TiltCard>
        </FadeUp>
    );
}

// Client logos section component
function ClientLogosSection() {
    return (
        <section className="py-24 px-8 bg-black border-y border-zinc-800">
            <div className="max-w-7xl mx-auto">
                <FadeUp>
                    <h2 className="text-2xl font-normal text-center mb-8 text-white">
                        Powering the world's best product teams.
                    </h2>
                    <p className="text-lg text-center mb-16 text-zinc-400">
                        From next-gen startups to established enterprises.
                    </p>
                </FadeUp>

                <FadeUp delay={0.2}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 items-center justify-items-center">
                        {CLIENT_LOGOS.map((client) => (
                            <div
                                key={client.name}
                                className="text-white text-2xl md:text-3xl font-semibold opacity-60 hover:opacity-100 transition-opacity"
                            >
                                {client.logo}
                            </div>
                        ))}
                    </div>
                </FadeUp>
            </div>
        </section>
    );
}

// Main page component
export default function Home() {
    return (
        <main className="flex min-h-screen flex-col bg-black">
            <HeroSection />
            <ClientLogosSection />
        </main>
    );
}
