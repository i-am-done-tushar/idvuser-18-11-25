import { DocumentDetailsModal } from "./DocumentDetailsModal";

interface VerifiedCredentialCardProps {
  title: string;
  documentType: string;
  completedOn: string;
  expiresOn: string;
}

const StatusBadge = () => {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2 h-2 rounded-full bg-[#5E9872]" />
      <span className="font-roboto text-xs font-normal leading-5 text-[#1C3829]">
        Verified
      </span>
    </div>
  );
};

export function VerifiedCredentialCard({
  title,
  documentType,
  completedOn,
  expiresOn,
}: VerifiedCredentialCardProps) {
  return (
    <div className="flex flex-col items-start gap-2 rounded border border-[#DEDEDD] bg-white">
      <div className="flex px-3 py-2 flex-col justify-center items-start self-stretch gap-2">
        <div className="flex h-7 justify-between items-center self-stretch">
          <h3 className="flex-1 text-[#172B4D] text-left font-roboto text-sm font-bold leading-normal truncate">
            {title}
          </h3>
          <StatusBadge />
        </div>
        <div className="flex items-center gap-1 self-stretch">
          <svg
            className="w-4 h-4"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.33073 1.51562V4.26932C9.33073 4.64268 9.33073 4.82937 9.4034 4.97198C9.46733 5.09742 9.56926 5.1994 9.69473 5.26332C9.83733 5.33598 10.024 5.33598 10.3974 5.33598H13.1511M9.33073 11.3359H5.33073M10.6641 8.66927H5.33073M13.3307 6.66142V11.4693C13.3307 12.5894 13.3307 13.1494 13.1127 13.5773C12.921 13.9536 12.6151 14.2595 12.2387 14.4513C11.8109 14.6693 11.2509 14.6693 10.1307 14.6693H5.86406C4.74396 14.6693 4.1839 14.6693 3.75608 14.4513C3.37976 14.2595 3.0738 13.9536 2.88205 13.5773C2.66406 13.1494 2.66406 12.5894 2.66406 11.4693V4.53594C2.66406 3.41583 2.66406 2.85578 2.88205 2.42796C3.0738 2.05163 3.37976 1.74567 3.75608 1.55392C4.1839 1.33594 4.74396 1.33594 5.86406 1.33594H8.00526C8.4944 1.33594 8.739 1.33594 8.9692 1.3912C9.17326 1.44019 9.36833 1.521 9.54733 1.63066C9.74913 1.75434 9.92206 1.92729 10.268 2.2732L12.3935 4.39868C12.7394 4.74458 12.9123 4.91754 13.036 5.11937C13.1457 5.29831 13.2265 5.4934 13.2755 5.69747C13.3307 5.92765 13.3307 6.17224 13.3307 6.66142Z"
              stroke="#676879"
              strokeWidth="1.33333"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[#505258] font-roboto text-xs font-normal leading-5">
            Employee ID Card
          </span>
        </div>
        <div className="flex justify-between items-start self-stretch">
          <div className="flex flex-col items-start gap-1">
            <span className="text-[#505258] font-roboto text-xs font-normal leading-5">
              Completed on
            </span>
            <span className="text-[#172B4D] font-roboto text-xs font-semibold leading-5">
              {completedOn}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-[#505258] font-roboto text-xs font-normal leading-5">
              Expires on
            </span>
            <span className="text-[#D83A52] font-roboto text-xs font-semibold leading-5">
              {expiresOn}
            </span>
          </div>
        </div>
        <DocumentDetailsModal
          trigger={
            <button className="flex items-center gap-0.5 text-[#0073EA] font-roboto text-xs font-normal leading-5 hover:underline">
              View Details
              <svg
                className="w-3 h-3"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2.5 6H9.5M9.5 6L6.5 3M9.5 6L6.5 9"
                  stroke="#0073EA"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          }
        />
      </div>
    </div>
  );
}
