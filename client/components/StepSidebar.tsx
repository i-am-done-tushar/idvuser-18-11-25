import { TemplateSection } from "@shared/templates";

interface StepSidebarProps {
  sections: TemplateSection[];
  currentStep: number;
}

interface Step {
  number: number;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  height: string;
}

export function StepSidebar({ sections, currentStep }: StepSidebarProps) {
  // Map sections to steps with proper descriptions and heights from Figma design
  const steps: Step[] = sections.map((section, index) => {
    const stepNumber = index + 1;
    let description = "";
    let height = "";
    
    switch (section.sectionType) {
      case "personalInformation":
        description = "Please provide your basic personal information to begin the identity verification process.";
        height = "123px";
        break;
      case "documents":
        description = "Choose a valid government-issued ID (like a passport, driver's license, or national ID) and upload a clear photo of it.";
        height = "142px";
        break;
      case "biometrics":
        description = "Take a live selfie to confirm you are the person in the ID document.";
        height = "102px";
        break;
    }

    return {
      number: stepNumber,
      title: section.name,
      description,
      isActive: stepNumber === currentStep,
      isCompleted: stepNumber < currentStep,
      height,
    };
  });

  return (
    <div className="flex w-80 p-4 flex-col items-start gap-1 flex-shrink-0 rounded-l-lg bg-background" style={{ height: '100%' }}>
      {steps.map((step, index) => (
        <div key={step.number} className="self-stretch relative" style={{ height: step.height }}>
          {/* Step Content Card */}
          <div 
            className={`flex w-[263px] p-3 flex-col items-start gap-1 rounded-lg absolute ${
              step.isActive ? 'bg-step-active-bg' : 'bg-background'
            }`}
            style={{ 
              left: '41px', 
              top: '0px',
              height: step.height
            }}
          >
            {/* Step Title */}
            <div className="self-stretch text-text-primary font-roboto text-[15px] font-bold leading-6">
              {step.title}
            </div>
            
            {/* Step Details */}
            <div className="flex flex-col items-start gap-1 self-stretch">
              <div className="self-stretch text-text-primary font-roboto text-[13px] font-medium">
                Step {step.number}
              </div>
              <div className="self-stretch text-text-secondary font-figtree text-[13px] font-normal leading-5">
                {step.description}
              </div>
            </div>
          </div>

          {/* Step Number Circle and Connector */}
          <div 
            className="flex-shrink-0 absolute left-0"
            style={{ 
              width: step.number === 3 ? '29px' : '28px',
              height: step.number === 1 ? '110px' : step.number === 2 ? '130px' : '28px',
              top: step.number === 1 ? '6px' : '5px'
            }}
          >
            {/* Circle */}
            <div 
              className="flex-shrink-0 absolute left-0 top-0"
              style={{ 
                width: step.number === 3 ? '29px' : '28px',
                height: '28px'
              }}
            >
              {step.number === 3 ? (
                <svg 
                  width="29" 
                  height="28" 
                  viewBox="0 0 29 28" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute left-0 top-0"
                >
                  <path 
                    d="M14.2825 0.75C21.7699 0.750184 27.8137 6.69636 27.8137 14C27.8137 21.3036 21.7699 27.2498 14.2825 27.25C6.79486 27.25 0.750244 21.3037 0.750244 14C0.750244 6.69625 6.79486 0.75 14.2825 0.75Z" 
                    fill={step.isActive || step.isCompleted ? "#0073EA" : "white"}
                    stroke={step.isActive || step.isCompleted ? "#0073EA" : "#D0D4E4"}
                    strokeWidth="1.5"
                  />
                </svg>
              ) : (
                <svg 
                  width="28" 
                  height="28" 
                  viewBox="0 0 28 28" 
                  fill="none" 
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute left-0 top-0"
                >
                  <circle 
                    cx="14.0002" 
                    cy="14" 
                    r="13.25" 
                    fill={step.isActive || step.isCompleted ? "#0073EA" : "white"}
                    stroke={step.isActive || step.isCompleted ? "#0073EA" : "#D0D4E4"}
                    strokeWidth="1.5"
                  />
                </svg>
              )}
              
              {/* Step Number */}
              <div 
                className="absolute text-[13px] font-roboto font-normal"
                style={{
                  left: '10px',
                  top: step.number === 2 ? '6px' : '7px',
                  width: '8px',
                  height: '15px',
                  color: step.isActive || step.isCompleted ? 'white' : '#42526E'
                }}
              >
                {step.number}
              </div>
            </div>
            
            {/* Connector Line (except for last step) */}
            {index < steps.length - 1 && (
              <div 
                className="absolute"
                style={{
                  width: step.number === 2 ? '84px' : '71px',
                  height: '0px',
                  left: '14px',
                  top: step.number === 1 ? '39px' : '46px',
                  background: step.isCompleted ? '#0073EA' : step.number === 2 ? '#C3C6D4' : '#D0D4E4'
                }}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
