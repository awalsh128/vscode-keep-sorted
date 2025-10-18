// Example file demonstrating keep-sorted functionality

// @ts-ignore
import { ComponentC } from './components/c';
// @ts-ignore
import { ComponentA } from './components/a';
// @ts-ignore
import { ComponentB } from './components/b';

// keep-sorted start case=no
const items = [
  'Zebra',
  'apple', 
  'Banana',
  'cherry'
];
// keep-sorted end

export class ExampleClass {
  // keep-sorted start
  private prop3: string;
  private prop1: number;
  private prop2: boolean;
  // keep-sorted end
  
  constructor() {
    // keep-sorted start
    this.prop3 = 'value';
    this.prop1 = 42;
    this.prop2 = true;
    // keep-sorted end
  }
}