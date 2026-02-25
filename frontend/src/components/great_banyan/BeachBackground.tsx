import React from 'react';

const commonStyles = `
    .beach-background-container {
        --sky-day: linear-gradient(to bottom, #87CEEB 0%, #E0F7FA 100%);
        --ocean-day: linear-gradient(to bottom, #006994 0%, #00BFFF 100%);
        --sand-day: linear-gradient(to bottom, #F4A460 0%, #F5DEB3 100%);
    }

    .beach-background-container {
        --sky-day: linear-gradient(to bottom, #87CEEB 0%, #E0F7FA 100%);
        --ocean-day: linear-gradient(to bottom, #006994 0%, #00BFFF 100%);
        --sand-day: linear-gradient(to bottom, #F4A460 0%, #F5DEB3 100%);
    }

    @keyframes wave-scroll {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
    }

    @keyframes cloud-drift {
        from { transform: translateX(-150px); }
        to { transform: translateX(calc(100vw + 150px)); }
    }

    .wave-animation-slow {
        animation: wave-scroll 20s linear infinite;
    }

    .wave-animation-fast {
        animation: wave-scroll 12s linear infinite;
    }

    .cloud {
        position: absolute;
        background: white;
        border-radius: 50px;
        opacity: 0.8;
        filter: blur(5px);
    }

    .cloud::before, .cloud::after {
        content: '';
        position: absolute;
        background: white;
        border-radius: 50%;
    }
`;

export const BeachBackground: React.FC = () => {
    return (
        <div className="beach-background-container" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 0,
        }}>
            <style>{commonStyles}</style>

            {/* Sky Layer - 55% */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '55%',
                background: 'var(--sky-gradient, linear-gradient(to bottom, #87CEEB 0%, #E0F7FA 100%))',
            }}>
                {/* Cloud 1 */}
                <div style={{
                    top: '15%',
                    animation: 'cloud-drift 45s linear infinite',
                    animationDelay: '-5s',
                }} className="cloud">
                    <div style={{ width: '120px', height: '40px' }} />
                    <div style={{ width: '60px', height: '60px', top: '-30px', left: '20px', position: 'absolute', backgroundColor: 'white', borderRadius: '50%' }} />
                    <div style={{ width: '50px', height: '50px', top: '-15px', left: '60px', position: 'absolute', backgroundColor: 'white', borderRadius: '50%' }} />
                </div>

                {/* Cloud 2 */}
                <div style={{
                    top: '30%',
                    animation: 'cloud-drift 60s linear infinite',
                    animationDelay: '-25s',
                    opacity: 0.6,
                    transform: 'scale(0.8)',
                }} className="cloud">
                    <div style={{ width: '100px', height: '35px' }} />
                    <div style={{ width: '50px', height: '50px', top: '-25px', left: '15px', position: 'absolute', backgroundColor: 'white', borderRadius: '50%' }} />
                </div>

                {/* Cloud 3 */}
                <div style={{
                    top: '8%',
                    animation: 'cloud-drift 55s linear infinite',
                    animationDelay: '-40s',
                    opacity: 0.7,
                    transform: 'scale(1.2)',
                }} className="cloud">
                    <div style={{ width: '150px', height: '45px' }} />
                    <div style={{ width: '70px', height: '70px', top: '-35px', left: '30px', position: 'absolute', backgroundColor: 'white', borderRadius: '50%' }} />
                    <div style={{ width: '60px', height: '60px', top: '-20px', left: '75px', position: 'absolute', backgroundColor: 'white', borderRadius: '50%' }} />
                </div>
            </div>

            {/* Ocean Layer - 30% */}
            <div style={{
                position: 'absolute',
                top: '55%',
                left: 0,
                width: '100%',
                height: '30%',
                background: 'var(--ocean-gradient, linear-gradient(to bottom, #006994 0%, #00BFFF 100%))',
            }} />

            {/* Mid Ocean Waves Layer */}
            <div style={{
                position: 'absolute',
                top: '70%', // Middle of the ocean
                left: 0,
                width: '200%',
                height: '40px',
                marginTop: '-20px',
                zIndex: 0.5,
                opacity: 0.4,
            }} className="wave-animation-slow">
                <svg
                    width="100%"
                    height="40px"
                    viewBox="0 0 1000 40"
                    preserveAspectRatio="none"
                    style={{ display: 'block' }}
                >
                    <path
                        d="M 0 20 Q 125 0 250 20 T 500 20 T 750 20 T 1000 20 V 40 H 0 Z"
                        fill="#00BFFF" // Lighter blue for the mid wave
                    />
                </svg>
            </div>

            {/* Surf Wave Border Wrapper */}
            <div style={{
                position: 'absolute',
                top: '85%',
                left: 0,
                width: '200%', // Double width for seamless scrolling
                height: '80px',
                marginTop: '-40px', // Center the wave on the boundary
                zIndex: 1,
            }} className="wave-animation-fast">
                <svg
                    width="100%"
                    height="80px"
                    viewBox="0 0 1000 80"
                    preserveAspectRatio="none"
                    style={{ display: 'block' }}
                >
                    <path
                        d="M 0 40 Q 125 0 250 40 T 500 40 T 750 40 T 1000 40 V 80 H 0 Z"
                        fill="#F4A460" // Match the top of the sand gradient
                    />
                </svg>
            </div>

            {/* Sand Layer - 15% */}
            <div style={{
                position: 'absolute',
                top: '85%',
                left: 0,
                width: '100%',
                height: '15%',
                background: 'var(--sand-gradient, linear-gradient(to bottom, #F4A460 0%, #F5DEB3 100%))',
            }} />
        </div>
    );
};
