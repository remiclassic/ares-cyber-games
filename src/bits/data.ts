import type { Scenario } from "./engine";

// Meridian Freight's new depot gets 10.20.4.0/24 to split up. Fictional; pending SME review
// (docs/design/BIT_BY_BIT.md).

export const SCENARIO: Scenario = {
  id: "the-new-depot",
  title: "The New Depot",
  org: "Meridian Freight",
  base: "10.20.4",
  stages: [
    {
      id: "binary",
      title: "Binary",
      lesson: "Each gear is one bit. Turn gears on until they add up to the number. Every octet is just eight of these.",
      tasks: [
        { kind: "value", id: "b1", prompt: "The depot's core switch is 10.20.4.192. Build 192.", target: 192 },
        { kind: "value", id: "b2", prompt: "The badge reader is 10.20.4.37. Build 37.", target: 37 },
        { kind: "value", id: "b3", prompt: "The new access point is 10.20.4.172. Build 172.", target: 172 },
      ],
    },
    {
      id: "masks",
      title: "Masks",
      lesson: "A mask marks which bits are the network. The ones are always on the left, with no gaps. /24 fills the first three octets, so the last octet holds the rest.",
      tasks: [
        { kind: "mask", id: "m1", prompt: "The camera VLAN is a /26. Build the last octet of its mask.", prefix: 26 },
        { kind: "mask", id: "m2", prompt: "The building-management VLAN is a /28. Build the last octet of its mask.", prefix: 28 },
      ],
    },
    {
      id: "sizing",
      title: "Sizing",
      lesson: "Fewer network bits means more host bits and more hosts. Pick the smallest subnet that still fits: it limits what a compromised device can reach and saves addresses.",
      tasks: [
        { kind: "size", id: "s1", prompt: "Warehouse scanners: 50 devices. Build the mask of the smallest subnet that fits.", need: 50, label: "Warehouse scanners" },
        { kind: "size", id: "s2", prompt: "Point-to-point link to the harbour router: 2 devices. Build the mask.", need: 2, label: "Harbour link" },
        { kind: "size", id: "s3", prompt: "Office VLAN: 100 devices. Build the mask.", need: 100, label: "Office VLAN" },
      ],
    },
    {
      id: "network",
      title: "Which network?",
      lesson: "An alert names an address. To know which segment to look at (or isolate), AND the address with its mask to get the network address.",
      tasks: [
        { kind: "network", id: "n1", prompt: "An alert names 10.20.4.77/26. Build the network address it belongs to.", host: 77, prefix: 26 },
        { kind: "network", id: "n2", prompt: "Another alert names 10.20.4.200/27. Build its network address.", host: 200, prefix: 27 },
      ],
    },
  ],
};
