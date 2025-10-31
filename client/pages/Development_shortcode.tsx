import React from "react";
import { useNavigate } from "react-router-dom";

const DevelopmentShortcodes = () => {
  const navigate = useNavigate();
  
  // Array of shortcodes for testing
  const shortcodes = [
    "AXpl7s7H_LDqJCT_p3GqjSlm5wyDaDBy-TBBg-MEkDrW7ZIxlz5dLNF45yod4fev8yfXHZr2G-Nl9EKy4H1IAvk6OGUZOq62tQFEL8iOTws0c6gciiOJcmbnNYg1bYw_Chu1uEO3wxnelqbVrgikKtgQVb1eK9Br-FNVEGrbXJu3V6l_GvHncPjQHRMdyVeQGNizxWMEhgdl_JSRSyFz8L8ey_wb29Mov25izA4Mnn4J475iuDoYT6L6QVtGeuHhAcdCRbwm4XPXwCbicNqh72grh36Fpg",
    "AR51AKplSTUHufHpcZ61dSitHyrH7ySzH6bgntyCdleM0P3IMt8CUxKWaux7T5LGMIIqSe3ezgZXONRKMXoV2gjfGQ76wnAAivWx25unBxVxINoP2TxJ6VT38b5eCNBb9__KRbFQpVnzDTZhptQiao1WRHPhsybv_xmaFJgMXbxsVn7dKygKH-Mz8jiFTvopTZ_MZNti4ujc6ROls9ETmpx4UrDluoqUA0I9Nna98c0bP_nAXD5huJ4II69HA2X4BnVaMXpqEPTmYHBhwHgI-dqiEAZF2TJigg",
    "shortcode3",
    "shortcode4",
    "shortcode5",
    "shortcode6",
    "shortcode7",
    "shortcode8",
    "shortcode9",
    "shortcode10"
  ];

  const handleClick = (code: string) => {
    // Navigate to the form page with the selected shortcode
    navigate(`/form?code=${encodeURIComponent(code)}`);
  };

  return (
    <div className="fixed top-0 left-0 p-4 space-x-2 z-10">
      {shortcodes.map((code, index) => (
        <button
          key={index}
          onClick={() => handleClick(code)}
          className="text-green-500 hover:text-green-700 focus:outline-none"
        >
          Clickme{index + 1}
        </button>
      ))}
    </div>
  );
};

export default DevelopmentShortcodes;
