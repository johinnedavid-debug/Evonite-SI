"use client";
import { useEffect, useRef } from "react";
interface Particle { x:number; y:number; vx:number; vy:number; radius:number; opacity:number; color:string; }
export default function LiveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    let animationId: number; let particles: Particle[] = [];
    const mouse = { x: -1000, y: -1000 };
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    const colors = ["rgba(34,211,238,0.3)","rgba(52,211,153,0.2)","rgba(167,139,250,0.2)"];
    const initParticles = () => {
      particles = [];
      const count = Math.floor((canvas.width * canvas.height) / 15000);
      for (let i = 0; i < count; i++) {
        particles.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height,
          vx:(Math.random()-0.5)*0.3, vy:(Math.random()-0.5)*0.3,
          radius:Math.random()*2+1, opacity:Math.random()*0.5+0.2,
          color:colors[Math.floor(Math.random()*colors.length)] });
      }
    };
    initParticles();
    const handleMouse = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener("mousemove", handleMouse);
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i+1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x; const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx*dx+dy*dy);
          if (dist < 120) {
            ctx.beginPath(); ctx.strokeStyle = `rgba(34,211,238,${0.1*(1-dist/120)})`;
            ctx.lineWidth = 0.5; ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y); ctx.stroke();
          }
        }
      }
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        const mdx = p.x-mouse.x; const mdy = p.y-mouse.y;
        const mDist = Math.sqrt(mdx*mdx+mdy*mdy);
        if (mDist < 150) { const force=(150-mDist)/150; p.vx+=(mdx/mDist)*force*0.5; p.vy+=(mdy/mDist)*force*0.5; }
        p.vx *= 0.99; p.vy *= 0.99;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
        ctx.fillStyle = p.color; ctx.fill();
      });
      animationId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animationId); window.removeEventListener("resize",resize); window.removeEventListener("mousemove",handleMouse); };
  }, []);
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" style={{ opacity:0.6 }} />;
}
