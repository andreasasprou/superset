import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Superset",
	description: "Superset Website",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={`overscroll-none ${GeistSans.variable} ${GeistMono.variable}`}
		>
			<body className="overscroll-none font-sans">{children}</body>
		</html>
	);
}
