export function Dashboard() {
  // Mock data for verified credentials
  const verifiedCredentials = [
    {
      id: 1,
      name: "Opinder Singh",
      documentType: "Aadhar Card",
      profileImage: "https://api.builder.io/api/v1/image/assets/TEMP/f021a7991ff41a16f92b6cf5984980c0c4edf3d2?width=160",
      dateOfBirth: "15/12/1980",
      gender: "Male",
      verificationId: "XXXXXX56",
      createdOn: "20 April 2025, 11:45 AM",
      address: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiu sit amet"
    },
    {
      id: 2,
      name: "Opinder Singh",
      documentType: "Aadhar Card", 
      profileImage: "https://api.builder.io/api/v1/image/assets/TEMP/f021a7991ff41a16f92b6cf5984980c0c4edf3d2?width=160",
      dateOfBirth: "15/12/1980",
      gender: "Male",
      verificationId: "XXXXXX56",
      createdOn: "20 April 2025, 11:45 AM",
      address: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiu sit amet"
    }
  ];

  return (
    <div className="w-full min-h-screen bg-page-background">
      {/* Header */}
      <div className="flex w-full h-11 items-center justify-between px-8 border-b border-border bg-white">
        <div className="flex items-center">
          {/* Arcon Logo */}
          <div className="flex items-center">
            <svg
              width="64"
              height="16"
              viewBox="0 0 64 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5"
            >
              <path
                d="M19.6451 6.27505C20.4605 5.29486 21.4477 4.80469 22.6065 4.80469C23.2074 4.80469 23.76 4.97008 24.2643 5.30072C24.7686 5.63143 25.1548 6.05658 25.4231 6.57622L25.5679 4.96414H27.6281V14.7073H25.5679L25.4231 13.0776C25.1548 13.5972 24.7686 14.0224 24.2643 14.353C23.76 14.6837 23.2074 14.8491 22.6065 14.8491C21.4477 14.8491 20.4605 14.359 19.6451 13.3787C18.8296 12.3867 18.4219 11.1998 18.4219 9.81804C18.4219 8.43624 18.8296 7.25524 19.6451 6.27505ZM21.3833 11.625C21.8339 12.1327 22.3812 12.3867 23.025 12.3867C23.6795 12.3867 24.2321 12.1387 24.6827 11.6426C25.1334 11.1348 25.3587 10.5266 25.3587 9.81804C25.3587 9.10947 25.1334 8.50713 24.6827 8.0111C24.2321 7.50326 23.6795 7.24938 23.025 7.24938C22.3812 7.24938 21.8339 7.50326 21.3833 8.0111C20.9327 8.50713 20.7073 9.10947 20.7073 9.81804C20.7073 10.5266 20.9327 11.1289 21.3833 11.625ZM29.5129 4.96414H31.573L31.734 6.36361C32.2598 5.38342 33.1343 4.89332 34.3575 4.89332C34.6686 4.89332 34.9369 4.91693 35.1622 4.96414L34.6954 7.35568C34.5667 7.33207 34.4755 7.3202 34.4219 7.3202C33.6707 7.3202 33.0431 7.57415 32.5387 8.08199C32.0344 8.57795 31.7823 9.42237 31.7823 10.6152V14.7073H29.5129V4.96414ZM37.3457 6.29279C38.2255 5.31253 39.2932 4.82243 40.5485 4.82243C41.2996 4.82243 42.0025 5.01729 42.657 5.40702C43.3115 5.78495 43.8534 6.29866 44.2825 6.94821L42.4156 8.31227C41.9542 7.67452 41.3319 7.35568 40.5485 7.35568C39.9262 7.35568 39.3951 7.59776 38.9551 8.08199C38.5153 8.56615 38.2953 9.15074 38.2953 9.83578C38.2953 10.5325 38.5153 11.123 38.9551 11.6072C39.3951 12.0915 39.9262 12.3335 40.5485 12.3335C41.3748 12.3335 42.0078 11.9792 42.4477 11.2707L44.3308 12.6524C43.9124 13.3256 43.3705 13.8629 42.7052 14.2645C42.04 14.666 41.3211 14.8668 40.5485 14.8668C39.2932 14.8668 38.2202 14.3766 37.3296 13.3964C36.4498 12.4044 36.0098 11.2175 36.0098 9.83578C36.0098 8.45398 36.4551 7.27298 37.3457 6.29279ZM46.619 6.29279C47.4989 5.31253 48.5665 4.82243 49.8219 4.82243C51.0773 4.82243 52.1503 5.31846 53.0409 6.31046C53.9422 7.29072 54.3929 8.46578 54.3929 9.83578C54.3929 11.2175 53.9476 12.3985 53.057 13.3787C52.1557 14.3708 51.0773 14.8668 49.8219 14.8668C48.5665 14.8668 47.4935 14.3766 46.603 13.3964C45.7231 12.4044 45.2832 11.2175 45.2832 9.83578C45.2832 8.45398 45.7285 7.27298 46.619 6.29279ZM47.5687 9.83578C47.5687 10.5325 47.7886 11.123 48.2285 11.6072C48.6685 12.0915 49.1996 12.3335 49.8219 12.3335C50.455 12.3335 50.9915 12.0915 51.4314 11.6072C51.8713 11.123 52.0913 10.5325 52.0913 9.83578C52.0913 9.15074 51.8713 8.56615 51.4314 8.08199C50.9915 7.59776 50.455 7.35568 49.8219 7.35568C49.1996 7.35568 48.6685 7.59776 48.2285 8.08199C47.7886 8.56615 47.5687 9.15074 47.5687 9.83578ZM55.8398 14.7073V4.96414H57.9L58.0448 6.38135C58.3024 5.90892 58.6404 5.531 59.0588 5.24757C59.488 4.95234 59.9709 4.80469 60.5073 4.80469C61.5803 4.80469 62.428 5.21216 63.0504 6.02703C63.6834 6.8419 63.9999 8.07605 63.9999 9.72947V14.7073H61.7466V9.72947C61.7466 8.9146 61.5696 8.30046 61.2155 7.88712C60.8722 7.46198 60.443 7.24938 59.928 7.24938C59.4022 7.24938 58.9676 7.46198 58.6243 7.88712C58.2809 8.30046 58.1092 8.9146 58.1092 9.72947V14.7073H55.8398Z"
                fill="#323238"
              />
              <path
                d="M14.3486 12.736C14.6548 13.3353 14.2196 14.0465 13.5466 14.0465H3.02185C2.3453 14.0465 1.91028 13.3285 2.22355 12.7288L7.54372 2.54495C7.8823 1.89684 8.81128 1.901 9.14404 2.55212L14.3486 12.736Z"
                stroke="#D83A52"
                strokeWidth="2.42826"
              />
            </svg>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-5 bg-border mx-2" />

          {/* Rippling Logo */}
          <div className="flex items-center">
            <svg
              width="80"
              height="23"
              viewBox="0 0 80 23"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-6"
            >
              <g clipPath="url(#clip0_2641_14270)">
                <path
                  d="M1.79875 10.2148C1.79875 8.97716 1.17188 7.95455 0 7.0957H2.72375C3.2039 7.46144 3.59293 7.93332 3.86041 8.47442C4.1279 9.01552 4.26659 9.61118 4.26563 10.2148C4.26659 10.8184 4.1279 11.4141 3.86041 11.9552C3.59293 12.4963 3.2039 12.9682 2.72375 13.3339C3.60813 13.7027 4.11125 14.6028 4.11125 15.8911V18.3457H1.645V15.8911C1.645 14.664 1.05938 13.8052 0.000625 13.3345C1.1725 12.4751 1.79875 11.4524 1.79875 10.2148ZM7.14375 10.2148C7.14375 8.97716 6.51688 7.95455 5.345 7.0957H8.06938C8.54941 7.46151 8.93832 7.93341 9.20569 8.47451C9.47307 9.01561 9.61166 9.61123 9.61063 10.2148C9.61166 10.8184 9.47307 11.414 9.20569 11.9551C8.93832 12.4962 8.54941 12.9681 8.06938 13.3339C8.95313 13.7027 9.45688 14.6028 9.45688 15.8911V18.3457H6.99V15.8911C6.99 14.664 6.40375 13.8052 5.345 13.3345C6.51688 12.4751 7.14375 11.4524 7.14375 10.2148ZM12.49 10.2148C12.49 8.97716 11.8631 7.95455 10.6913 7.0957H13.415C13.8951 7.46144 14.2842 7.93332 14.5517 8.47442C14.8191 9.01552 14.9578 9.61118 14.9569 10.2148C14.9578 10.8184 14.8191 11.4141 14.5517 11.9552C14.2842 12.4963 13.8951 12.9682 13.415 13.3339C14.2994 13.7027 14.8025 14.6028 14.8025 15.8911V18.3457H12.3356V15.8911C12.3356 14.664 11.75 13.8052 10.6913 13.3345C11.8631 12.4751 12.49 11.4524 12.49 10.2148ZM22.47 16.3017H20.6V9.14093H25.195C27.405 9.14093 28.4944 9.95977 28.4944 11.2993C28.4944 12.2094 27.96 12.8945 26.9631 13.2426C27.9906 13.3958 28.4531 13.9377 28.4531 14.9097V16.3005H26.5619V14.9916C26.5619 14.1727 26.1506 13.8458 25.0713 13.8458H22.4713V16.3017H22.47ZM25.0913 10.1842H22.47V12.8032H25.0706C26.0163 12.8032 26.6019 12.2813 26.6019 11.4631C26.6019 10.6548 26.0581 10.1842 25.0913 10.1842ZM31.7419 9.14093H29.8713V16.3017H31.7419V9.14093ZM37.4775 13.9683H35.1956V16.3005H33.3244V9.14093H37.5181C39.7281 9.14093 40.89 10.0617 40.89 11.5349C40.89 13.0582 39.7081 13.9683 37.4775 13.9683ZM37.4363 10.1842H35.1956V12.9251H37.4156C38.3819 12.9251 38.9781 12.4344 38.9781 11.5449C38.9781 10.6755 38.3819 10.1842 37.4363 10.1842ZM46.1531 13.9683H43.8713V16.3005H42V9.14093H46.1938C48.4038 9.14093 49.5656 10.0617 49.5656 11.5349C49.5656 13.0582 48.3831 13.9683 46.1531 13.9683ZM46.1119 10.1842H43.8713V12.9251H46.0913C47.0575 12.9251 47.6538 12.4344 47.6538 11.5449C47.6538 10.6755 47.0575 10.1842 46.1119 10.1842ZM52.5463 9.14093V15.2366H57.2131V16.3017H50.6756V9.14093H52.5463ZM60.2544 9.14093H58.3838V16.3017H60.2544V9.14093ZM63.0713 11.5343V16.3017H61.8375V9.14093H63.2369L68.335 13.9071V9.14093H69.5688V16.3017H68.1706L63.0713 11.5343ZM75.675 9.97977C73.8963 9.97977 72.735 11.1049 72.735 12.782C72.735 14.4384 73.845 15.4616 75.5719 15.4616H75.695C76.2813 15.4616 76.9388 15.3385 77.5456 15.1447V13.2114H74.5238V12.1888H79.375V15.5535C78.3681 16.0755 76.8463 16.4849 75.6131 16.4849H75.4488C72.6113 16.4849 70.7819 14.991 70.7819 12.8226C70.7819 10.6749 72.6631 8.95716 75.5513 8.95716H75.7156C76.9188 8.95716 78.2956 9.33533 79.3138 9.92852L78.7788 10.7974C77.8644 10.2967 76.7744 9.97977 75.7981 9.97977H75.675Z"
                  fill="black"
                />
              </g>
              <defs>
                <clipPath id="clip0_2641_14270">
                  <rect width="79.6875" height="22.5" fill="white" />
                </clipPath>
              </defs>
            </svg>
          </div>
        </div>

        {/* Admin Badge */}
        <div className="flex items-center gap-1">
          <div className="flex w-8 h-8 justify-center items-center rounded-full bg-[#F65F7C]">
            <span className="text-white font-roboto text-xs font-medium">OS</span>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <div className="flex w-full flex-col px-8 py-6 gap-1">
        {/* Page Title */}
        <div className="flex flex-col gap-1 mb-6">
          <h1 className="text-text-primary font-roboto text-[22px] font-bold leading-[30px]">
            Verified Credentials
          </h1>
          <p className="text-text-muted font-roboto text-[13px] font-normal leading-[15px]">
            View and manage all successful verifications below. Your data is encrypted and accessible only to authorized parties.
          </p>
        </div>

        {/* Credentials Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {verifiedCredentials.map((credential) => (
            <div
              key={credential.id}
              className="flex flex-col p-4 gap-4 bg-white border border-input-border rounded-lg max-w-[412px]"
            >
              {/* Header Section */}
              <div className="flex items-start gap-2">
                {/* Profile Image */}
                <div className="flex w-20 h-20 justify-center items-center flex-shrink-0">
                  <img
                    src={credential.profileImage}
                    alt={credential.name}
                    className="w-20 h-20 rounded-[2px] object-cover"
                  />
                </div>

                {/* Name and Document Type */}
                <div className="flex items-start gap-1">
                  <div className="flex flex-col">
                    <h3 className="text-text-primary font-roboto text-base font-medium leading-normal">
                      {credential.name}
                    </h3>
                    <p className="text-text-muted font-roboto text-sm font-normal leading-normal">
                      {credential.documentType}
                    </p>
                  </div>

                  {/* Verification Badge */}
                  <svg
                    className="w-[18px] h-[18px] flex-shrink-0"
                    viewBox="0 0 18 18"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8.11296 0.973598C8.58894 0.451172 9.41106 0.451173 9.88704 0.973598L10.3454 1.47666C10.6611 1.82323 11.1498 1.95416 11.5965 1.81191L12.245 1.60541C12.9184 1.39097 13.6304 1.80203 13.7814 2.49245L13.9268 3.15729C14.027 3.6153 14.3847 3.97303 14.8427 4.0732L15.5075 4.2186C16.198 4.3696 16.609 5.08158 16.3946 5.755L16.1881 6.40347C16.0458 6.8502 16.1768 7.33887 16.5233 7.65462L17.0264 8.11296C17.5488 8.58894 17.5488 9.41106 17.0264 9.88704L16.5233 10.3454C16.1768 10.6611 16.0458 11.1498 16.1881 11.5965L16.3946 12.245C16.609 12.9184 16.198 13.6304 15.5075 13.7814L14.8427 13.9268C14.3847 14.027 14.027 14.3847 13.9268 14.8427L13.7814 15.5075C13.6304 16.198 12.9184 16.609 12.245 16.3946L11.5965 16.1881C11.1498 16.0458 10.6611 16.1768 10.3454 16.5233L9.88704 17.0264C9.41106 17.5488 8.58894 17.5488 8.11296 17.0264L7.65462 16.5233C7.33886 16.1768 6.8502 16.0458 6.40347 16.1881L5.755 16.3946C5.08158 16.609 4.3696 16.198 4.2186 15.5075L4.0732 14.8427C3.97303 14.3847 3.6153 14.027 3.15729 13.9268L2.49245 13.7814C1.80203 13.6304 1.39097 12.9184 1.60541 12.245L1.81191 11.5965C1.95416 11.1498 1.82323 10.6611 1.47666 10.3454L0.973598 9.88704C0.451172 9.41106 0.451173 8.58894 0.973598 8.11296L1.47666 7.65462C1.82323 7.33886 1.95416 6.8502 1.81191 6.40347L1.60541 5.755C1.39097 5.08158 1.80203 4.3696 2.49245 4.2186L3.15729 4.0732C3.6153 3.97303 3.97303 3.6153 4.0732 3.15729L4.2186 2.49245C4.3696 1.80203 5.08158 1.39097 5.755 1.60541L6.40347 1.81191C6.8502 1.95416 7.33887 1.82323 7.65462 1.47666L8.11296 0.973598Z"
                      fill="#258750"
                    />
                    <path
                      d="M12.6 6.89941L8.0625 11.4369L6 9.37441"
                      stroke="white"
                      strokeWidth="0.99"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              {/* Personal Details Row */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-text-primary font-roboto text-[13px] font-normal leading-[120%]">
                    Date Of Birth
                  </p>
                  <p className="text-text-muted font-roboto text-sm font-normal leading-[120%]">
                    {credential.dateOfBirth}
                  </p>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-text-primary font-roboto text-[13px] font-normal leading-[120%]">
                    Gender
                  </p>
                  <p className="text-text-muted font-roboto text-sm font-normal leading-[120%]">
                    {credential.gender}
                  </p>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-text-primary font-roboto text-[13px] font-normal leading-[120%]">
                    Verification Id
                  </p>
                  <p className="text-text-muted font-roboto text-sm font-normal leading-[120%]">
                    {credential.verificationId}
                  </p>
                </div>
              </div>

              {/* Created Date and Address Row */}
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1 w-[124px]">
                  <p className="text-text-primary font-roboto text-[13px] font-normal leading-[120%]">
                    Created On
                  </p>
                  <p className="text-text-muted font-roboto text-sm font-normal leading-[120%]">
                    {credential.createdOn}
                  </p>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <p className="text-text-primary font-roboto text-[13px] font-normal leading-[120%]">
                    Address
                  </p>
                  <p className="text-text-muted font-roboto text-sm font-normal leading-[120%] line-clamp-3">
                    {credential.address}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
